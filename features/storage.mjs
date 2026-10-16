export class LectureStore {
    async open() {
        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('livelectures', 1);
            request.onupgradeneeded = () => {
                for (const name of ['lectures', 'recovery', 'assets', 'settings']) request.result.createObjectStore(name);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close other LiveLectures tabs to update storage.'));
        });
        return this;
    }
    transaction(stores, mode, run) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(stores, mode);
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage operation failed.'));
            try { result = run(tx); } catch (error) { tx.abort(); reject(error); }
        });
    }
    async get(store, key) {
        let request;
        await this.transaction([store], 'readonly', tx => { request = tx.objectStore(store).get(key); });
        return request.result;
    }
    put(store, key, value) {
        return this.transaction([store], 'readwrite', tx => tx.objectStore(store).put(value, key));
    }
    async all(store) {
        let request;
        await this.transaction([store], 'readonly', tx => { request = tx.objectStore(store).getAll(); });
        return request.result;
    }
    async save(record) {
        // The document and its previous recovery versions commit in one transaction.
        await this.transaction(['lectures', 'recovery', 'settings'], 'readwrite', tx => {
            const lectures = tx.objectStore('lectures');
            const previous = lectures.get(record.id);
            previous.onsuccess = () => {
                if (previous.result && previous.result.json !== record.json) {
                    const recovery = tx.objectStore('recovery');
                    const request = recovery.get(record.id);
                    request.onsuccess = () => recovery.put([previous.result, ...(request.result || [])].slice(0, 5), record.id);
                }
                lectures.put(record, record.id);
                tx.objectStore('settings').put(record.id, 'active');
            };
        });
    }
    async deleteLecture(id) {
        const record = await this.get('lectures', id);
        await this.transaction(['lectures', 'recovery', 'assets'], 'readwrite', tx => {
            tx.objectStore('lectures').delete(id); tx.objectStore('recovery').delete(id);
            for (const recording of record?.metadata?.recordings || []) tx.objectStore('assets').delete(recording.id);
        });
    }
}
