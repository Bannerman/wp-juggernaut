import '@testing-library/jest-dom';

// Isolate tests from the developer's real user config (~/.juggernaut): user
// profiles, prompt templates and site-config are read from this temp dir
// unless a test sets JUGGERNAUT_CONFIG_DIR itself.
if (!process.env.JUGGERNAUT_CONFIG_DIR) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  process.env.JUGGERNAUT_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'juggernaut-test-config-'));
}
