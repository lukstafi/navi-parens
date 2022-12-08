import * as assert from 'assert';

import * as vscode from 'vscode';
import * as myExtension from '../../extension';

function charactersAround(doc: vscode.TextDocument, pos: vscode.Position): string {
	return doc.getText(new vscode.Range(
		doc.positionAt(doc.offsetAt(pos) - 2), doc.positionAt(doc.offsetAt(pos) + 2)));
}

async function openFileWithCursor(annotated: string, language: string): Promise<{
	textEditor: vscode.TextEditor,
	targetPos: vscode.Position
}> {
	let source = annotated.indexOf('@');
	let target = annotated.indexOf('^');
	if (source < target) { --target; } else {	--source;	}
	let content = annotated.replace('@', '').replace('^', '');
	const doc = await vscode.workspace.openTextDocument({language, content});
	const sourcePos = doc.positionAt(source);
	const targetPos = doc.positionAt(target);
	// When debugging, to enable charactersAround in watch expressions. 
	// const debug1 = charactersAround(doc, sourcePos);
	const textEditor = await vscode.window.showTextDocument(doc);
	textEditor.selection = new vscode.Selection(sourcePos, sourcePos);
	return { textEditor, targetPos };
}

function getAnnotatedContent(textEditor: vscode.TextEditor, sourcePos: vscode.Position): string {
	const doc = textEditor.document;
	const source = doc.offsetAt(sourcePos);
	const target = doc.offsetAt(textEditor.selection.active);
	let content = textEditor.document.getText();
	if (source < target) {
		content = content.slice(0, source) + '@' + content.slice(source, target) + '^' + content.slice(target);
	} else {
		content = content.slice(0, target) + '^' + content.slice(target, source) + '@' + content.slice(source);
	}
	return content;
}

const isDebugSession = false;

function testCase(content: string, command: string, mode: string, language: string, debugThis?: boolean | undefined) {
	if ((isDebugSession && !debugThis) || (!isDebugSession && debugThis)) { return; }
	return async () => {
		const { textEditor, targetPos } = await openFileWithCursor(content, language);
		const sourcePos = textEditor.selection.active;
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
			'selectToEndScope': () => myExtension.goToOuterScope(textEditor, true, false, false),
			'goPastNextWord': () => myExtension.goPastWord(textEditor, false, false),
			'goPastPreviousWord': () => myExtension.goPastWord(textEditor, false, true),
			'selectPastNextWord': () => myExtension.goPastWord(textEditor, true, false),
			'selectPastPreviousWord': () => myExtension.goPastWord(textEditor, true, true),
		}));
		// TODO(2): enable symbol providers -- perhaps add mocks.
		const modes = new Map([
			['IND/JTB', ['Indentation', 'JumpToBracket']],
			['IND/RAW', ['Indentation', 'Raw']],
			['NON/JTB', ['None', 'JumpToBracket']],
			['NON/RAW', ['None', 'Raw']],
			['IND/NON', ['Indentation', 'None']],
			['NON/NON', ['None', 'None']],
		]);
		const modePair = modes.get(mode);
		assert.notStrictEqual(modePair, undefined);
		if (!modePair) { return; }
		const [blockMode, bracketMode] = modePair;
		await vscode.workspace.getConfiguration().update("navi-parens.blockScopeMode", blockMode,
			vscode.ConfigurationTarget.Global, true);
		await vscode.workspace.getConfiguration().update("navi-parens.bracketScopeMode", bracketMode,
			vscode.ConfigurationTarget.Global, true);
		// We cannot use vscode.commands.executeCommand because that creates a different TextEditor.
		const action = commands.get(command);
		assert.notStrictEqual(action, undefined);
		if (!action) { return; }
		await action();
		const result = getAnnotatedContent(textEditor, sourcePos);
		// assert.deepEqual(result, content)
		assert.deepStrictEqual(textEditor.selection.active, targetPos, result);
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	for (const mode of ['IND/RAW', 'IND/JTB']) {
		// Basics.
		test('Basic parentheses navigation: up from between parens ' + mode, testCase(
			`(^(@()))`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down from between parens ' + mode, testCase(
			`((@())^)`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: up no-change ' + mode, testCase(
			`^@((()))`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down no-change ' + mode, testCase(
			`((()))@^`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: left no-change ' + mode, testCase(
			`((^@()))`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: right no-change ' + mode, testCase(
			`((()@^))`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: left ' + mode, testCase(
			`(^(())@)`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: right ' + mode, testCase(
			`(@(())^)`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: beginning from between parens ' + mode, testCase(
			`((^()@()))`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end from between parens ' + mode, testCase(
			`((()@()^))`,
			'goToEndScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: beginning no-change ' + mode, testCase(
			`((^@()))`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end no-change ' + mode, testCase(
			`((()@^))`,
			'goToEndScope', mode, 'typescript'
		));
		// Simple syntaxes.
		test('Basic syntax navigation: up bracket scope ' + mode, testCase(
			`
			for ^(let index = 0; index @< array.length; index++) {
				const element = array[index];
			}
			`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic syntax navigation: down bracket scope ' + mode, testCase(
			`
			for (let index = 0; index @< array.length; index++)^ {
				const element = array[index];
			}
			`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic syntax navigation: up bracket-overlap IND scope ' + mode, testCase(
			// The bracket scope does not include the indentation scope, always prefer the bracket scope.
			`
			for (let index = 0; index < array.length; index++) ^{
				const element = array@[index];
			}
			`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic syntax navigation: down bracket scope 2 ' + mode, testCase(
			// The bracket scope does not include the indentation scope, always prefer the bracket scope.
			`
			for (let index = 0; index < array.length; index++) {
				const element = array@[index];
			}^
			`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic syntax navigation: down inside-bracket IND scope ' + mode, testCase(
			// The bracket scope strictly includes the indentation scope here, so the arguably-worse end-point is correct.
			`
			{
				let index = 0;
				const element = array@[index];
			^}
			`,
			'goToDownScope', mode, 'typescript'
		));

		test('Basic syntax navigation: up bracket scope nested ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				const element = array^[@index];
			}
			`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic syntax navigation: down bracket scope nested ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				const element = array[in@dex]^;
			}
			`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic syntax navigation: next bracket scope ' + mode, testCase(
			// As a special case, when the cursor is already inside the block scope (cannot happen for
			// the bracket scope), we go past the bracket end scope.
			`
			fo@r (let index = 0; index < array.length; index++)^ {
				const element = array[index];
			}
			`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic syntax navigation: previous bracket scope ' + mode, testCase(
			`
			for ^(let index = 0; index < array.length; index++) @{
				const element = array[index];
			}
			`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic syntax navigation: next bracket scope inside ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				c@onst element = array[index]^;
			}
			`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic syntax navigation: previous bracket scope inside ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				const element = array^[index];
	@		}
			`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic syntax navigation: begin scope with IND ' + mode, testCase(
			// For begin/end scope, we always pick the nearer end-point, which here comes from indentation.
			// (For indentation the less-indented line is a big delimiter, its start is outside but it is not inside.)
			`
			for (let index = 0; index < array.length; index++) {
				^const element = @array[index];
			}
			`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic syntax navigation: end scope with IND ' + mode, testCase(
			// For begin/end scope, we always pick the nearer end-point, which comes from indentation.
			`
			for (let index = 0; index < array.length; index++) {
				const element = @array[index];^
			}
			`,
			'goToEndScope', mode, 'typescript'
		));
	}
	for (const mode of ['NON/RAW', 'NON/JTB']) {
		test('Bracket syntax navigation: begin scope other line ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(^array[index],
				g@(index));
		}
		`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: end scope other line ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(arr@ay[index],
				g(index)^);
		}
		`,
			'goToEndScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: previous scope other line ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(array^[index],
				g@(index));
		}
		`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: next scope other line ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(array[index]@,
				g(index)^, index);
		}
		`,
			'goPastNextScope', mode, 'typescript'
		));
	}
	{
		const mode = 'IND/NON';
		test('Basic syntax navigation: up scope using IND ' + mode, testCase(
			// The less-indented non-whitespace-starting-part line is like a big start delimiter for the scope.
			`
			for item in range:
				^if condition:
					pa@ss
				elif condition:
					pass
			`,
			'goToUpScope', mode, 'python'
		));
		test('Basic syntax navigation: down scope using IND ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss
				^elif condition:
					pass
			`,
			'goToDownScope', mode, 'python'
		));
		test('Basic syntax navigation: begin scope using IND ' + mode, testCase(
			`
			for item in range:
				if condition:
					^pa@ss
				elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Basic syntax navigation: begin scope using IND 2 ' + mode, testCase(
			`
			for item in range:
				^if condition:
					pass
				@elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Basic syntax navigation: begin scope using IND 3 ' + mode, testCase(
			`
			for item in range:
				if condition:
					^pass
					pa@ss
				elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Basic syntax navigation: end scope using IND ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss^
				elif condition:
					pass
			`,
			'goToEndScope', mode, 'python'
		));
		test('Basic syntax navigation: end scope using IND 2 ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss
					pass^
				elif condition:
					pass
			`,
			'goToEndScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND ' + mode, testCase(
			`
			for item in range:
				pa@ss
				if condition:
					pass
				^elif condition:
					pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND 4 ' + mode, testCase(
			`
			for item in range:
				if co@ndition:
					pass
				^elif condition:
					pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND 2 ' + mode, testCase(
			`
			for item in range:
			@	if condition:
					pass
				^elif condition:
					pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND 5 ' + mode, testCase(
			`
			for item@ in range:
				if condition:
					pass
				elif condition:
					pass
			^`,
			'goPastNextScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND 3 ' + mode, testCase(
			`
			@for item in range:
				if condition:
					pass
				elif condition:
					pass
			^`,
			'goPastNextScope', mode, 'python'
		));

		test('Basic syntax navigation: next scope using IND no-change ' + mode, testCase(
			`
			for item in range:
				if condition:
					pass
				@^elif condition:
					pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Basic syntax navigation: next scope using IND no-change 2 ' + mode, testCase(
			`
			for item in range:
				if condition:
					pass
				@^elif condition:
					pass
			pass
			`,
			'goPastNextScope', mode, 'python'
		));

		test('Basic syntax navigation: previous scope using IND ' + mode, testCase(
			`
			for item in range:
				^if condition:
					pass
				elif@ condition:
					pass
			`,
			'goPastPreviousScope', mode, 'python'
		));

	}
	for (const mode of ['NON/RAW', 'NON/JTB']) {
		test('Basic syntax navigation: begin scope without block scopes ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {^
				const element = @array[index];
			}
			`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic syntax navigation: end scope without block scopes ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				const element = @array[index];
			^}
			`,
			'goToEndScope', mode, 'typescript'
		));
		test('Basic syntax navigation: up bracket scope without block scopes ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) ^{
				const element = array@[index];
			}
			`,
			'goToUpScope', mode, 'typescript'
		));
	}
	test('Word navigation: previous word same line', testCase(
		`
		^word1 @word2
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word same line', testCase(
		`
		word1@ word2^
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word same line bof', testCase(
		`^word1 @word2`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word same line eof', testCase(
		`word1@ word2^`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: beginning of word', testCase(
		`
		word1 ^wor@d2
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: end of word', testCase(
		`
		wo@rd1^ word2
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: beginning of word bof', testCase(
		`^wor@d2`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: end of word eof', testCase(
		`wo@rd1^`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: no-change bof', testCase(
		` ^@word2`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: no-change eof', testCase(
		`word1@^ `,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word other line', testCase(
		`
		^word1
		 @word2
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word other line', testCase(
		`
		word1@
		 word2^
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: no-change previous other line', testCase(
		`
		...
		 ^@word2
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: no-change next other line', testCase(
		`
		word1@^
		 ...
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word no space other line', testCase(
		`
		word1
^word2@
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word no space other line', testCase(
		`
		@word1^
word2
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word same line punctuation', testCase(
		`
		.^word1, !@word2
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word same line punctuation', testCase(
		`
		word1@, !word2^;
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word other line punctuation', testCase(
		`
		.^word1;
		 .@word2;
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word other line punctuation', testCase(
		`
		.word1@;
		 .word2^;
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: previous word other line punctuation 2', testCase(
		`
		.^word1;
		 .@,word2;
		`,
		'goPastPreviousWord', 'NON/NON', 'typescript'
	));
	test('Word navigation: next word other line punctuation 2', testCase(
		`
		.word1,@;
		 .word2^;
		`,
		'goPastNextWord', 'NON/NON', 'typescript'
	));

});
