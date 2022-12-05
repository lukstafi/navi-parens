"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const testElectron1 = require("@vscode/test-electron");
async function main() {
    let status = null;
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        // Download VS Code, unzip it and run the integration test
				console.log(`Dev: ${extensionDevelopmentPath}, test: ${extensionTestsPath}`)
        status = await (testElectron1.runTests)({ extensionDevelopmentPath, extensionTestsPath });
    }
    catch (err) {
      console.error('Failed to run tests');
			console.log(`Error status ${status} -- ${err}`);
      process.exit(1);
    }
}
main();
//# sourceMappingURL=runTest.js.map