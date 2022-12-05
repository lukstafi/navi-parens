"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const testElectron1 = require("@vscode/test-electron");
async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        // Download VS Code, unzip it and run the integration test
			  console.log(`Dev: ${extensionDevelopmentPath}, test: ${extensionTestsPath}`);
        await (testElectron1.runTests)({ extensionDevelopmentPath, extensionTestsPath });
    }
    catch (err) {
      console.error('Failed to run tests');
			console.log('NOTE: For mysterious reasons, running tests on precommit does not work from ' +
				'the VSCode source control. Use the terminal instead: `git commit -m "[explain the commit]"`.');
      process.exit(1);
    }
}
main();
//# sourceMappingURL=runTest.js.map