import * as assert from 'assert';

import * as vscode from 'vscode';
import * as myExtension from '../../extension';

function charactersAround(doc: vscode.TextDocument, pos: vscode.Position): string {
	return doc.getText(new vscode.Range(
		doc.positionAt(doc.offsetAt(pos) - 2), doc.positionAt(doc.offsetAt(pos) + 2)));
}

async function openFileWithCursor(annotated: string): Promise<{
	textEditor: vscode.TextEditor,
	targetPos: vscode.Position
}> {
	let source = annotated.indexOf('@');
	let target = annotated.indexOf('^');
	if (source < target) { --target; } else {	--source;	}
	let content = annotated.replace('@', '').replace('^', '');
	const doc = await vscode.workspace.openTextDocument({
		language: 'typescript', content,
	});
	const sourcePos = doc.positionAt(source);
	const targetPos = doc.positionAt(target);
	const debug1 = charactersAround(doc, sourcePos);
	const textEditor = await vscode.window.showTextDocument(doc);
	textEditor.selection = new vscode.Selection(sourcePos, sourcePos);
	return { textEditor, targetPos };
}

function testCase(content: string, command: string, mode: string) {
	return async () => {
		const { textEditor, targetPos } = await openFileWithCursor(content);
		const commands = new Map(Object.entries({
			'goPastNextScope': () => myExtension.goPastSiblingScope(textEditor, false, false),
			'goPastPreviousScope': () => myExtension.goPastSiblingScope(textEditor, false, true),
			'selectPastNextScope': () => myExtension.goPastSiblingScope(textEditor, true, false),
			'selectPastPreviousScope': () => myExtension.goPastSiblingScope(textEditor, true, true),
			'goToUpScope': () => myExtension.goToOuterScope(textEditor, false, true, false),
			'goToDownScope': () => myExtension.goToOuterScope(textEditor, false, false, false),
			'selectToUpScope': () => myExtension.goToOuterScope(textEditor, true, true, false),
			'selectToDownScope': () => myExtension.goToOuterScope(textEditor, true, false, false),
			'goToBeginScope': () => myExtension.goToOuterScope(textEditor, false, true, true),
			'goToEndScope': () => myExtension.goToOuterScope(textEditor, false, false, true),
			'selectToBeginScope': () => myExtension.goToOuterScope(textEditor, true, true, false),
			'selectToEndScope': () => myExtension.goToOuterScope(textEditor, true, false, false)
		}));
		// TODO(2): enable symbol providers -- debug why they don't work in tests.
		const modes = new Map([
			['IND/JTB', ['Indentation', 'JumpToBracket']],
			['IND/RAW', ['Indentation', 'Raw']],
			['NON/JTB', ['None', 'JumpToBracket']],
			['NON/RAW', ['None', 'Raw']],
			['IND/NON', ['Indentation', 'None']]
		]);
		const modePair = modes.get(mode);
		assert.notStrictEqual(modePair, undefined);
		if (!modePair) { return; }
		const [blockMode, bracketMode] = modePair;
		vscode.workspace.getConfiguration().update("navi-parens.blockScopeMode", blockMode,
			vscode.ConfigurationTarget.Global, true);
			vscode.workspace.getConfiguration().update("navi-parens.bracketScopeMode", bracketMode,
			vscode.ConfigurationTarget.Global, true);
		// We cannot use vscode.commands.executeCommand because that creates a different TextEditor.
		const action = commands.get(command);
		assert.notStrictEqual(action, undefined);
		if (!action) { return; }
		await action();
		assert.deepStrictEqual(textEditor.selection.active, targetPos);
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	for (const mode of ['IND/RAW', 'IND/JTB']) {
		test('Basic parentheses navigation: up from between parens', testCase(
			`(^(@()))`,
			'goToUpScope', mode
		));
		test('Basic parentheses navigation: down from between parens', testCase(
			`((@())^)`,
			'goToDownScope', mode
		));
		test('Basic parentheses navigation: up no-change', testCase(
			`^@((()))`,
			'goToUpScope', mode
		));
		test('Basic parentheses navigation: down no-change', testCase(
			`((()))@^`,
			'goToDownScope', mode
		));
		test('Basic parentheses navigation: left no-change', testCase(
			`((^@()))`,
			'goPastPreviousScope', mode
		));
		test('Basic parentheses navigation: right no-change', testCase(
			`((()@^))`,
			'goPastNextScope', mode
		));
		test('Basic parentheses navigation: left', testCase(
			`(^(())@)`,
			'goPastPreviousScope', mode
		));
		test('Basic parentheses navigation: right', testCase(
			`(@(())^)`,
			'goPastNextScope', mode
		));
		test('Basic parentheses navigation: beginning from between parens', testCase(
			`((^()@()))`,
			'goToBeginScope', mode
		));
		test('Basic parentheses navigation: end from between parens', testCase(
			`((()@()^))`,
			'goToEndScope', mode
		));
		test('Basic parentheses navigation: beginning no-change', testCase(
			`((^@()))`,
			'goToBeginScope', mode
		));
		test('Basic parentheses navigation: end no-change', testCase(
			`((()@^))`,
			'goToEndScope', mode
		));
	}
});
