import * as assert from 'assert';

import * as vscode from 'vscode';
import * as myExtension from '../../extension';

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
			'goToPreviousEmptyLine': () => myExtension.goToEmptyLine(textEditor, false, true),
			'goToNextEmptyLine': () => myExtension.goToEmptyLine(textEditor, false, false),
			'selectToPreviousEmptyLine': () => myExtension.goToEmptyLine(textEditor, true, true),
			'selectToNextEmptyLine': () => myExtension.goToEmptyLine(textEditor, true, false),
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
		const [blockMode, bracketsMode] = modePair;
		await vscode.workspace.getConfiguration().update("navi-parens.blockScopeMode", blockMode,
			vscode.ConfigurationTarget.Global, true);
		await vscode.workspace.getConfiguration().update("navi-parens.bracketScopeMode", bracketsMode,
			vscode.ConfigurationTarget.Global, true);
		// Wait extra for the bracket providers to settle.
		if (bracketsMode === 'JumpToBracket') {
			await new Promise(f => setTimeout(f, 800));
		}
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
			`((^ ()@()))`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end from between parens ' + mode, testCase(
			`((()@() ^))`,
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
			// (For indentation the less-indented line is a big delimiter, its start is outside but it is not inside.)
			`
			for (let index = 0; index < array.length; index++) {
				^const element = @array[index];
			}
			`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic syntax navigation: end scope with IND ' + mode, testCase(
			`
			for (let index = 0; index < array.length; index++) {
				const element = @array[index];^
			}
			`,
			'goToEndScope', mode, 'typescript'
		));

		test('Tricky syntax navigation: next scope with IND from code line ' + mode, testCase(
			`
			@for (let index = 0; index < array.length; index++) {
				const element = array[index];
			}^
			`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: next scope with IND from code line 2 ' + mode, testCase(
			`
			@{
				let local = true;
			}^
			{
				let local = 'true';
			}
			`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: next scope with IND from code line 3 ' + mode, testCase(
			`
			@{
				let local = true; }
			^{
				let local = 'true';
			}
			`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: next scope with IND from empty line ' + mode, testCase(
			`
			@
			for (let index = 0; index < array.length; index++) {
				const element = array[index];
			}^
			`,
			'goPastNextScope', mode, 'typescript'
		));

		test('Tricky syntax navigation: next scope with IND from empty line to empty line ' + mode, testCase(
			`
			@
			def foo(bar, baz):
			  bar()
				baz()
			^
			pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Tricky syntax navigation: next scope with IND from python code line ' + mode, testCase(
			`
			@def foo(bar, baz):
			  bar()
				baz()
			^
			pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Tricky syntax navigation: down scope with IND from header line no change ' + mode, testCase(
			`
			@^def foo(bar, baz):
				bar()
				baz()
			
			pass
			`,
			'goToDownScope', mode, 'python'
		));
		test('Tricky syntax navigation: down scope with IND from header line 2 no change ' + mode, testCase(
			`
			d@^ef foo(bar, baz):
				bar()
				baz()
			
			pass
			`,
			'goToDownScope', mode, 'python'
		));
		test('Tricky syntax navigation: down scope with IND from inner line ' + mode, testCase(
			`
			def foo(bar, baz):
				ba@r()
				baz()
			^
			pass
			`,
			'goToDownScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from code line ' + mode, testCase(
			`
			
			^def foo(bar, baz):
				bar()
				baz()
			
			@pass
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from attached code line ' + mode, testCase(
			`
			
			^def foo(bar, baz):
				bar()
				baz()
			@pass
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from empty line ' + mode, testCase(
			`
			^def foo(bar, baz):
			  bar()
				baz()
			pass
			@
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from hanging empty line ' + mode, testCase(
			`
			
			def foo(bar, baz):
			  bar()
				baz^()
			@
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from separating empty line ' + mode, testCase(
			`
			
			def foo(bar, baz):
				bar()
				baz^()
			@
			pass
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND to separating empty line ' + mode, testCase(
			`
			pass
			
			^def foo(bar, baz):
				bar()
				baz()
			pass
			@
			`,
			'goPastPreviousScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope with IND from and to separating empty line ' + mode, testCase(
			`
			pass
			
			def foo(bar, baz):
				bar()
				baz^()
			@
			pass
			`,
			'goPastPreviousScope', mode, 'python'
		));

		test('Tricky syntax navigation: down scope with IND from indented line ' + mode, testCase(
			`
			for (let index = 0;
				   index < array.length;
					 index++)@ {
				const element = array[index];
			}^
			`,
			'goToDownScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: previous scope with IND from indented line ' + mode, testCase(
			`
			for ^(let index = 0;
				   index < array.length;
					 index++)@ {
				const element = array[index];
			}
			`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: previous scope with IND from indented line 2 ' + mode, testCase(
			`
			print^("Hello, ",
                 name)@
			`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Tricky syntax navigation: next scope with IND from indented line ' + mode, testCase(
			`
			for (let index = 0;
				   index < array.length;
					 index++)@ {
				const element = array[index];
			}^
			`,
			'goPastNextScope', mode, 'typescript'
		));

	}
	for (const mode of ['NON/RAW', 'IND/RAW']) {
		test('Basic parentheses navigation: up to unmatched left ' + mode, testCase(
			`^(@()`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down to unmatched right ' + mode, testCase(
			`()@)^`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: up to unmatched left 2 ' + mode, testCase(
			`^(()@`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down to unmatched right 2 ' + mode, testCase(
			`@())^`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: begin to unmatched left ' + mode, testCase(
			`(^()@`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end to unmatched right ' + mode, testCase(
			`@()^)`,
			'goToEndScope', mode, 'typescript'
		));
	}
	{
		const mode = 'NON/RAW';
		test('Bracket syntax navigation: NON-block begin scope other line unmatched ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {^
			element = f(array[index],
				g(index))@;
		
		`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: NON-block end scope other line unmatched ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) 
			element = @f(array[index],
				g(index));
		^}
		`,
			'goToEndScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: NON-block up scope other line unmatched ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) ^{
			element = f(array[index],
				g(index))@;
		
		`,
			'goToUpScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: NON-block down scope other line unmatched ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) 
			element = @f(array[index],
				g(index));
		}^
		`,
			'goToDownScope', mode, 'typescript'
		));

		// Multicharacter brackets.
		test('Multicharacter brackets navigation: up from between parens ' + mode, testCase(
			`(^(* @() *))`,
			'goToUpScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: down from between parens ' + mode, testCase(
			`((* @() *)^)`,
			'goToDownScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: left no-change ' + mode, testCase(
			`((* ^@() *))`,
			'goPastPreviousScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: right no-change ' + mode, testCase(
			`((* ()@^ *))`,
			'goPastNextScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: left ' + mode, testCase(
			`(^(* () *)@)`,
			'goPastPreviousScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: right ' + mode, testCase(
			`(@(* () *)^)`,
			'goPastNextScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: beginning from between parens ' + mode, testCase(
			`((* ^ ()@() *))`,
			'goToBeginScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: end from between parens ' + mode, testCase(
			`((* ()@() ^ *))`,
			'goToEndScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: beginning no-change ' + mode, testCase(
			`((* ^@() *))`,
			'goToBeginScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: end no-change ' + mode, testCase(
			`((* ()@^ *))`,
			'goToEndScope', mode, 'pascal'
		));

		test('Multicharacter brackets navigation: up from between parens 2 ' + mode, testCase(
			`(^<p>@()</p>)`,
			'goToUpScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: down from between parens 2 ' + mode, testCase(
			`(<p>@()</p>^)`,
			'goToDownScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: left no-change 2 ' + mode, testCase(
			`(<p>^@()</p>)`,
			'goPastPreviousScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: right no-change 2 ' + mode, testCase(
			`(<p>()@^</p>)`,
			'goPastNextScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: left 2 ' + mode, testCase(
			`(^<p>()</p>@)`,
			'goPastPreviousScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: right 2 ' + mode, testCase(
			`(@<p>()</p>^)`,
			'goPastNextScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: beginning from between parens 2 ' + mode, testCase(
			`(<p>^ ()@()</p>)`,
			'goToBeginScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: end from between parens 2 ' + mode, testCase(
			`(<p>()@() ^</p>)`,
			'goToEndScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: beginning no-change 2 ' + mode, testCase(
			`(<p>^@()</p>)`,
			'goToBeginScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: end no-change 2 ' + mode, testCase(
			`(<p>()@^</p>)`,
			'goToEndScope', mode, 'html'
		));

		test('Multicharacter brackets navigation: up multiline ' + mode, testCase(
			`^<p>
			   <p> </p>@
			</p>`,
			'goToUpScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: down multiline ' + mode, testCase(
			`<p>
				@<p> </p>
			</p>^`,
			'goToDownScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: left multiline ' + mode, testCase(
			`<p>^<p>
				</p>
				@</p>`,
			'goPastPreviousScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: right multiline ' + mode, testCase(
			`<p>
			@<p>
			</p>^</p>`,
			'goPastNextScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: beginning multiline ' + mode, testCase(
			`<p>^
			 <p> </p>@<p> </p>
			 </p>`,
			'goToBeginScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: end multiline ' + mode, testCase(
			`<p>
			 <p> </p>@<p> </p>
			 ^</p>`,
			'goToEndScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: left multiline 2 ' + mode, testCase(
			`^<p><p>
				</p>
				</p>@`,
			'goPastPreviousScope', mode, 'html'
		));
		test('Multicharacter brackets navigation: right multiline 2 ' + mode, testCase(
			`@<p>
			<p>
			</p></p>^`,
			'goPastNextScope', mode, 'html'
		));
		// FIXME(11): bug.
		test('Multicharacter brackets navigation: left multiline 3 ' + mode, testCase(
			`^[
				(* comment *)
			]@`,
			'goPastPreviousScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: right multiline 3 ' + mode, testCase(
			`@[
				(* comment *)
			]^`,
			'goPastNextScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: up multiline 2 ' + mode, testCase(
			`^[
			   (* comment *)@
			]`,
			'goToUpScope', mode, 'pascal'
		));
		test('Multicharacter brackets navigation: down multiline 2 ' + mode, testCase(
			`[
			   @(* comment *)
			]^`,
			'goToDownScope', mode, 'pascal'
		));

	}
	{
		const mode = 'IND/RAW';
		test('Multicharacter brackets navigation: up multiline 3 ' + mode, testCase(
			`(* comment *)

			program Test;
			^begin
				Pass;
				@(* comment *)
				Pass;
			end.
			`,
			'goToUpScope', mode, 'pascal'
		));
		test('Non-Multicharacter brackets navigation: baseline for up multiline 3 ' + mode, testCase(
			`{ comment }

			program Test;
			^begin
				Pass;
				@{ comment }
				Pass;
			end.
			`,
			'goToUpScope', mode, 'pascal'
		));
		
		test('Tricky syntax navigation: either _next_ or down should find next scope ' + mode, testCase(
			`
			@for x in xs:
				if x:
					foo(x)
				pass
			^pass
			`,
			'goPastNextScope', mode, 'pascal'
		));
		
		test('Tricky syntax navigation: find next scope from inside indentation header ' + mode, testCase(
			`
			f@or x in xs:
				if x:
					foo(x)^
				pass
			pass
			`,
			'goPastNextScope', mode, 'pascal'
		));
		
		test('Tricky syntax navigation: either next or _down_ should find next scope ' + mode, testCase(
			`
			^@for x in xs:
				if x:
					foo(x)
				pass
			pass
			`,
			'goToDownScope', mode, 'pascal'
		));
		
		test('Tricky syntax navigation: either _next_ or down should find next scope 2 ' + mode, testCase(
`@for x in xs:
	if x:
		foo(x)
	pass
^pass`,
			'goPastNextScope', mode, 'pascal'
		));
	
		test('Corner case: respect indentation for going up scope ' + mode, testCase(
			`
^if true:
	pass
	pass@
			`,
			'goToUpScope', mode, 'python'
		));
		test('Corner case: respect indentation for going up scope 2 ' + mode, testCase(
			`
^if true:
	pass
	pass@`,
			'goToUpScope', mode, 'python'
		));
		test('Corner case: respect indentation for going up scope 3 ' + mode, testCase(
			`^if true:
	pass
	pass@`,
			'goToUpScope', mode, 'python'
		));
		test('Corner case: respect indentation for finding end of scope ' + mode, testCase(
			`
if true:
  pass
@	pass^
			`,
			'goToEndScope', mode, 'python'
		));
		test('Corner case: respect indentation for finding end of scope 2 ' + mode, testCase(
			`if true:
  pass
@	pass^`,
			'goToEndScope', mode, 'python'
		));
		test('Corner case: go to end scope from empty line ' + mode, testCase(
			`
if true:
@
	pass
	pass^
end
			`,
			'goToEndScope', mode, 'python'
		));
		test('Tricky syntax navigation: either go to down scope or go past next scope should ' +
			'find end of scope 1 ' + mode,
			testCase(
			`
			procedure Foo(Param: boolean);^@ begin  
				pass;
					
				pass;
			end
			`,
			'goToDownScope', mode, 'pascal'
		));
		test('Tricky syntax navigation: either go to up scope or go past next scope should ' +
			'find end of scope 2 ' + mode,
			testCase(
			`
			procedure Foo(Param: boolean);@ begin  
				pass;
					
				pass;
			^end
			`,
			'goPastNextScope', mode, 'pascal'
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
	for (const mode of ['IND/JTB', 'NON/JTB']) {
		test('Bracket syntax navigation: previous scope other line with comments ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(
				array^[index], // (comment), (comment)
				g@(index));
		}
		`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: next scope other line with comments ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(
				array[index]@, // (comment), (comment)
				g(index)^, index);
		}
		`,
			'goPastNextScope', mode, 'typescript'
		));
		// Note that the less-indented line is still part of the "far" indent scope.
		test('Bracket syntax navigation: previous scope other line with comments 2 ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(array^[index], // (comment), (comment)
				g@(index));
		}
		`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Bracket syntax navigation: next scope other line with comments 2 ' + mode, testCase(
			`
		for (let index = 0; index < array.length; index++) {
			element = f(array[index]@, // (comment), (comment)
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

		// Empty lines are never scope-introducing, to keep the logic simple.
		test('Tricky syntax navigation: up scope using IND empty line ' + mode, testCase(
			`
			^for item in range:
				if condition:
					@
				elif condition:
					pass
			`,
			'goToUpScope', mode, 'python'
		));
		test('Tricky syntax navigation: down scope using IND empty line ' + mode, testCase(
			`
			for item in range:
				if condition:
					@
				elif condition:
					pass
			^`,
			'goToDownScope', mode, 'python'
		));
		test('Tricky syntax navigation: begin scope using IND empty line ' + mode, testCase(
			`
			for item in range:
				^if condition:
					@
				elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Tricky syntax navigation: end scope using IND empty line ' + mode, testCase(
			`
			for item in range:
				if condition:
					@
				elif condition:
					pass^
			`,
			'goToEndScope', mode, 'python'
		));

		test('Tricky syntax navigation: end scope using IND end empty line ' + mode, testCase(
			`
			for item in range:
				if condition:
					@
				elif condition:
					pass^

			pass
			`,
			'goToEndScope', mode, 'python'
		));
		test('Tricky syntax navigation: begin scope using IND begin empty line ' + mode, testCase(
			`
			for item in range:

				^if condition:
					@
				elif condition:
					pass
			pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Tricky syntax navigation: next scope using IND end empty line ' + mode, testCase(
			`
			@for item in range:
				if condition:
					pass
				elif condition:
					pass
			^
			pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Tricky syntax navigation: next scope using IND begin and end empty line ' + mode, testCase(
			`
			@
			for item in range:
				if condition:
					pass
				elif condition:
					pass

			^
			pass
			`,
			'goPastNextScope', mode, 'python'
		));
		test('Tricky syntax navigation: previous scope using IND begin empty line ' + mode, testCase(
			`
			pass
      
			^for item in range:
				if condition:
					pass
				elif condition:
					pass
			
			@pass
			`,
			'goPastPreviousScope', mode, 'python'
		));
	}
	{
		const mode = 'IND/NON';
		test('Tab-space syntax navigation: up scope using IND ' + mode, testCase(
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
		test('Tab-space syntax navigation: down scope using IND ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss
		  	^elif condition:
					pass
			`,
			'goToDownScope', mode, 'python'
		));
		test('Tab-space syntax navigation: begin scope using IND ' + mode, testCase(
			`
			for item in range:
		  	if condition:
					^pa@ss
				elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Tab-space syntax navigation: begin scope using IND 2 ' + mode, testCase(
			`
			for item in range:
	  		^if condition:
					pass
		  	@elif condition:
					pass
			`,
			'goToBeginScope', mode, 'python'
		));
		test('Tab-space syntax navigation: begin scope using IND 3 ' + mode, testCase(
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
		test('Tab-space syntax navigation: end scope using IND ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss^
		  	elif condition:
					pass
			`,
			'goToEndScope', mode, 'python'
		));
		test('Tab-space syntax navigation: end scope using IND 2 ' + mode, testCase(
			`
			for item in range:
				if condition:
					pa@ss
	  			pass^
	  		elif condition:
					pass
			`,
			'goToEndScope', mode, 'python', true
		));
		test('Tab-space syntax navigation: next scope using IND ' + mode, testCase(
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

		test('Tab-space syntax navigation: next scope using IND no-change ' + mode, testCase(
			`
			for item in range:
				if condition:
					pass
		  	@^elif condition:
					pass
			`,
			'goPastNextScope', mode, 'python'
		));

		test('Tab-space syntax navigation: previous scope using IND ' + mode, testCase(
			`
			for item in range:
				^if condition:
					pass
		  	elif@ condition:
					pass
			`,
			'goPastPreviousScope', mode, 'python', true
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
	{
		const mode = 'NON/NON';
		test('Word navigation: previous word same line', testCase(
			`
		^word1 @word2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word same line', testCase(
			`
		word1@ word2^
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word same line bof', testCase(
			`^word1 @word2`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word same line eof', testCase(
			`word1@ word2^`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: beginning of word', testCase(
			`
		word1 ^wor@d2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: end of word', testCase(
			`
		wo@rd1^ word2
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous 1 character word same line', testCase(
			`
		^w @word2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next 1 character word same line', testCase(
			`
		word1@ w^
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: beginning of 1 character word', testCase(
			`
		word1 ^w@
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: end of 1 character word', testCase(
			`
		@w^ word2
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: beginning of word from 1 character', testCase(
			`
		word1 ^w@ord2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: end of word from 1 character', testCase(
			`
		word@1^ word2
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: beginning of word bof', testCase(
			`^wor@d2`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: end of word eof', testCase(
			`wo@rd1^`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: no-change bof', testCase(
			` ^@word2`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: no-change eof', testCase(
			`word1@^ `,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word other line', testCase(
			`
		^word1
		 @word2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word other line', testCase(
			`
		word1@
		 word2^
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: no-change previous other line', testCase(
			`
		...
		 ^@word2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: no-change next other line', testCase(
			`
		word1@^
		 ...
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word no space other line', testCase(
			`
		word1
^word2@
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word no space other line', testCase(
			`
		@word1^
word2
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word same line punctuation', testCase(
			`
		.^word1, !@word2
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word same line punctuation', testCase(
			`
		word1@, !word2^;
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word other line punctuation', testCase(
			`
		.^word1;
		 .@word2;
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word other line punctuation', testCase(
			`
		.word1@;
		 .word2^;
		`,
			'goPastNextWord', mode, 'typescript'
		));
		test('Word navigation: previous word other line punctuation 2', testCase(
			`
		.^word1;
		 .@,word2;
		`,
			'goPastPreviousWord', mode, 'typescript'
		));
		test('Word navigation: next word other line punctuation 2', testCase(
			`
		.word1,@;
		 .word2^;
		`,
			'goPastNextWord', mode, 'typescript'
		));
	}
	{
		const mode = 'NON/NON';
		test('Paragraph navigation: previous empty line', testCase(
			`
			paragraph1
^      
			paragraph2@
      
			paragraph3
		`,
			'goToPreviousEmptyLine', mode, 'text'
		));
		test('Paragraph navigation: next empty line', testCase(
			`
			paragraph1
      
			@paragraph2
^      
			paragraph3
		`,
			'goToNextEmptyLine', mode, 'text'
		));
		test('Paragraph navigation: previous empty line 2', testCase(
			`
			paragraph1
^      
			paragraph2
			paragraph2@
      
			paragraph3
		`,
			'goToPreviousEmptyLine', mode, 'text'
		));
		test('Paragraph navigation: next empty line 2', testCase(
			`
			paragraph1
      
			@paragraph2
			paragraph2
^      
			paragraph3
		`,
			'goToNextEmptyLine', mode, 'text'
		));
		test('Tricky paragraph navigation: beginning of document', testCase(
			`^paragraph
			paragraph@
		`,
			'goToPreviousEmptyLine', mode, 'text'
		));
		test('Tricky paragraph navigation: end of document', testCase(
			`
			@paragraph
			paragraph
			paragraph^`,
			'goToNextEmptyLine', mode, 'text'
		));
	}
});
