// Runs before any module is loaded (jest `setupFiles`): keep test uploads out of the real uploads/ dir.
process.env.UPLOAD_DIR = '.test-uploads';
