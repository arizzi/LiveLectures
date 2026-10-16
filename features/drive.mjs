const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve;
    script.onerror = () => { script.remove(); reject(new Error('Google services could not load. Check your connection.')); };
    document.head.append(script);
});
export class DriveStorage {
    async connect(clientId) {
        if (!clientId.endsWith('.apps.googleusercontent.com')) throw new Error('Enter your public Google OAuth client ID.');
        if (!window.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client');
        this.appId = clientId.split('-')[0];
        this.token = await new Promise((resolve, reject) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file',
                callback: result => result.error ? reject(new Error(result.error)) : resolve(result.access_token),
                error_callback: error => reject(new Error(error.message || error.type || 'Drive sign-in cancelled.'))
            });
            client.requestAccessToken();
        });
    }
    async request(url, options = {}) {
        if (!this.token) throw new Error('Connect Google Drive first.');
        const response = await fetch(url, { ...options, signal: AbortSignal.timeout(120000),
            headers: { ...options.headers, Authorization: `Bearer ${this.token}` } });
        if (response.status === 401) { this.token = null; throw new Error('Drive authorization expired. Connect again.'); }
        if (!response.ok) throw new Error(`Drive request failed (${response.status}).`);
        return response;
    }
    async backup(blob, name) {
        // Always create a new immutable backup. Never overwrite another device's edits.
        const boundary = 'livelectures-' + crypto.randomUUID();
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            JSON.stringify({ name, mimeType: blob.type }),
            `\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`, blob,
            `\r\n--${boundary}--\r\n`
        ]);
        const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
            method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
        });
        return response.json();
    }
    async pick(apiKey) {
        if (!this.token) throw new Error('Connect Google Drive first.');
        if (!apiKey) throw new Error('Enter your Google Picker API key.');
        if (!window.gapi) await loadScript('https://apis.google.com/js/api.js');
        await new Promise(resolve => gapi.load('picker', resolve));
        return new Promise((resolve, reject) => {
            const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
                .setMimeTypes('application/gzip,application/json,application/octet-stream');
            const picker = new google.picker.PickerBuilder().addView(view)
                .setOAuthToken(this.token).setDeveloperKey(apiKey).setAppId(this.appId).setOrigin(location.origin)
                .setCallback(data => {
                    if (data.action === google.picker.Action.PICKED) resolve(data.docs[0]);
                    if (data.action === google.picker.Action.CANCEL) reject(new Error('Drive picker cancelled.'));
                }).build();
            picker.setVisible(true);
        });
    }
    async open(apiKey) {
        const file = await this.pick(apiKey);
        const response = await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
        return new File([await response.blob()], file.name);
    }
    disconnect() {
        if (this.token) google.accounts.oauth2.revoke(this.token);
        this.token = null;
    }
}
