const { app, safeStorage } = require('electron');

app.whenReady().then(() => {
  try {
    const isAvailable = safeStorage.isEncryptionAvailable();
    console.log('DPAPI_AVAILABLE:', isAvailable);

    if (isAvailable) {
      const originalToken = 'spx_term_test_dpapi_secret_token_1234567890';
      const encBuffer = safeStorage.encryptString(originalToken);
      const hex = encBuffer.toString('hex');
      console.log('ENCRYPT_SUCCESS: true, length:', hex.length);

      const decBuffer = Buffer.from(hex, 'hex');
      const decrypted = safeStorage.decryptString(decBuffer);
      console.log('DECRYPT_SUCCESS:', decrypted === originalToken);
    }
  } catch (err) {
    console.error('DPAPI_ERROR:', err);
  } finally {
    app.quit();
  }
});
