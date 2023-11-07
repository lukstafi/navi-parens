# navi-parens README

_Navi Parens_ is a Visual Studio Code extension that provides structured code navigation similar to what's available in Emacs.
It also provides additional key bindings for moving the cursor without "fingers leaving the home row".

_Navi Parens_ also provides _Markmacs Mode_, which emulates TeXmacs-like WYSIWYG editing capabilities within preview panes by simply updating the document directly. When the cursor position changes, a cursor-scope marker are moved with it. Moreover, _Markmacs Mode_ adds commands such as "cycle-through" which replaces a token to the left of the cursor with its alternatives.

## Keywords

VSCode, Structured Code Navigation, Emacs S-Expressions, Atom Block Travel, Jump, Selection, Keymaps, Key Shortcuts, Home Row Cursor Movement, LaTeX, WYSIWYG, TeXmacs

## Navi Parens

### Overview

_Navi Parens_ provides commands for moving the cursor around smoothly from the innermost parentheses to the outermost code blocks and in between. It also offers keybindings centered around the `J, K, L, I` keys and the `Alt` modifier. E.g. moves of the cursor: `Alt+J` one character left, `Ctrl+Alt+J` one scope left, `Alt+K` one line up, `Ctrl+Alt+K` to outside the beginning of the scope around the cursor.

![Overview](animations/overview.gif)
* Activates the extension.
* Navigates in `SEM` mode across functions.
* Navigates in `SEM/JTB` mode within function.
* Switches to `IND`, navigates within function.
* Navigates across functions.
* Switches to `RAW` to demonstrate navigating within docu-comments.

### Features

Commands:
* `goPastNextScope`: `ctrl+alt+l` Go past the next same-level closing bracket/scope
* `goPastPreviousScope`: `ctrl+alt+j` Go to the previous same-level opening bracket/scope
* `goToUpScope`: `ctrl+alt+i` Go outside the opening of the current level
* `goToDownScope`: `ctrl+alt+k` Go outside the closing of the current level
* `goToBeginScope`: `ctrl+alt+a` Go near the opening of the current level but stay inside scope
* `goToEndScope`: `ctrl+alt+e` Go near the closing of the current level but stay inside scope
* `goToPreviousEmptyLine`: `ctrl+alt+h` Go to the previous line with only whitespace (or empty)
* `goToNextEmptyLine`: `ctrl+alt+;` Go to the next line with only whitespace (or empty)
* `selectToNextScope`: `shift+ctrl+alt+l` Select past the next same-level closing bracket/scope
* `selectToPreviousScope`: `shift+ctrl+alt+j` Select to the previous same-level opening bracket/scope
* `selectToUpScope`: `shift+ctrl+alt+i` Select till outside the opening of the current level
* `selectToDownScope`: `shift+ctrl+alt+k` Select till outside the closing of the current level
* `selectToBeginScope`: `shift+ctrl+alt+a` Select to near the opening of the current level but stay inside scope
* `selectToEndScope`: `shift+ctrl+alt+e` Select to near the closing of the current level but stay inside scope
* `selectToPreviousEmptyLine`: `shift+ctrl+alt+h` Select to the previous line with only whitespace (or empty)
* `selectToNextEmptyLine`: `shift+ctrl+alt+;` Select to the next line with only whitespace (or empty)
* `cycleBracketScopeMode`: `ctrl+alt+p` Cycle through the bracket scope logic (`ctrl+shift+\`, delimiter counting, none)
* `cycleBlockScopeMode`: `shift+ctrl+alt+p` Cycle through block scope logic (symbols, indentation, none)
* `goPastNextWord`: `alt+;` Go past the curent/next word, ignoring language-specific rules
* `goPastPreviousWord`: `alt+h` Go past the previous word / beginning of current, ignoring language-specific rules
* `selectPastNextWord`: `shift+alt+;` Select past the current/next word, ignoring language-specific rules
* `selectPastPreviousWord`: `shift+alt+h` Select past the previous word / beginning of current, ignoring language-specific rules

The meaning of "near the beginning/end of a scope" is mode-specific.

Extra key bindings:
* `insertCursorAtEndOfEachLineSelected`: rebound from `shift+alt+i` to `shift+alt+p`
* `cursorRight`: `alt+l`
* `cursorLeft`: `alt+j`
* `cursorUp`, `list.focusUp`, `selectPrevCodeAction`, `selectPrevSuggestion`, `selectPrevParameterHint`: `alt+i`
* `cursorDown`, `list.focusDown`, `selectNextCodeAction`, `selectNextSuggestion`, `selectNextParameterHint`: `alt+k`
* `cursorHome`: `alt+a`
* `cursorEnd`: `alt+e`
* `cursorRightSelect`: `shift+alt+l`
* `cursorLeftSelect`: `shift+alt+j`
* `cursorUpSelect`: `shift+alt+i`
* `cursorDownSelect`: `shift+alt+k`
* `cursorHomeSelect`: `shift+alt+a`
* `cursorEndSelect`: `shift+alt+e`
* `deleteRight`: `alt+d`
* `deleteWordRight`: `ctrl+alt+d`

_Navi Parens_ combines two sources of structure information:
* Brackets, braces, parentheses.
* Code blocks.

Each of the sources comes in two variants.
* The bracket scopes come from either a judicious use of the built-in `Go to Bracket` command, or just looking for the delimiters.
* The block scopes come from either semantic symbol providers, as in the outline view, where the corresponding scope is the full range of a definition; or from indentation.

An indentation scope comprises a less-indented line followed by at least one more-indented line. The first, less-indented line is a big opening delimiter for the indentation scope: none of it is inside the scope, and only the first non-whitespace position and earlier are outside the scope. The closing delimiter is the whitespace from the end of the last indented line to before the first non-whitespace position of the less-indented following line. Currently, if there is an empty line at the end of an indentation scope, the `Go Past Next Scope` and `Go To Down Scope` commands put the cursor there.

The `Raw` mode for bracket scopes is useful as it enables navigating within comments or string literals, and does not cause "jitter" like the `JumpToBracket` mode does. However, it is less reliable since it will count brackets even if they were not intended as delimiters.

### Some use cases

First _Navi Parens_-specific command activates the scope navigation modes indicator.

![activation](animations/activation.gif)

Navigation with `Semantic` mode.

![Semantic](animations/semantic.gif)

Navigation with `Indentation` mode.

![Indentation](animations/indentation.gif)

Navigation with `Jump To Bracket` with block modes disabled.

![Jump To Bracket bracket scope mode](animations/jumptobracket.gif)

Navigation with `Raw` bracket mode.

![Raw bracket scope mode](animations/rawbrackets.gif)

## MarkMacs Mode

_Markmacs Mode_ emulates TeXmacs-like WYSIWYG editing capabilities within preview panes by simply updating the document directly. When the cursor position changes, a cursor marker and a scope marker are moved with it. Moreover, VSC Markmacs adds commands such as "cycle-through" which replaces a token to the left of the cursor with its alternatives.

### Features

- Intercepts cursor position changes, and moves/adds a Markdown or LaTeX code (depending on context) to highlight the nearest scope (braces, parentheses, brackets) encompassing the cursor, with a color split indicating the cursor position.
  - The actual cursor and edit actions happen in the markdown / latex pane, but user's focus can be in the preview pane.
- Adds snippets, keybindings for the snippets commands.
- Adds a command to cycle through alternatives of what's to the left of the cursor.
    - E.g. $S$ -> $\Sigma$ -> $\sum$ -> $S$; $P$ -> $\Pi$ -> $\prod$ -> $P$; $f$ -> $\phi$ -> $\varphi$ -> $f$...
- Adds context-sensitive commands to extend the object at cursor to the right, bottom, left and up. For Markdown tables, adds columns or rows; for Mermaid diagrams, adds siblings or children or parents.

### Requirements

- [Mermaid VS Code extension](https://github.com/mjbvz/vscode-markdown-mermaid) to make full use of the graph editing functionality.
  - There's [a PanDoc filter](https://github.com/raghur/mermaid-filter) for [Mermaid](http://mermaid.js.org/#/).

## Extension Settings

This extension contributes the following settings:

* `navi-parens.rebind`: How to deal with the `shift+alt+i` binding conflict.
  * Defaults to `true`.
  * If `true`:
    * rebind `insertCursorAtEndOfEachLineSelected` from `shift+alt+i` to `shift+alt+p`
    * bind `cursorUpSelect` to `shift+alt+i`
    * do not make bindings for `ctrl+alt+o`.
  * If `false`:
    * bind `cursorUpSelect` to `ctrl+shift+alt+o`
    * bind `cursorUp` to both `alt+i` and `ctrl+alt+o`.
* `navi-parens.blockScopeMode`: an enum selecting where the non-bracket structure information comes from.
  * `Semantic`: the semantic analyzers integrated with VSCode. The default.
  * `Indentation`: _Navi Parens_ constructs symbols based on indentation. Details below.
  * `None`: same behavior as if there were no symbol definitions in text.
  * `ctrl+shift+alt+p` toggles between `Semantic` and `Indentation`.
* `navi-parens.bracketScopeMode`: an enum selecting how to get the bracket structure information.
  * `JumpToBracket`: uses `editor.action.jumpToBracket` (i.e. `ctrl+shift+\`). The default.
  * `Raw`: only the bracket characters are considered, without context.
  * `ctrl+shift+alt+p` toggles between `Semantic` and `Raw`.
* `navi-parens.closingBrackets`: the superset of supported closing delimiters.
  * Defaults to `[")", "]", "}", ">"]`.
  * Can be language specific.
* `navi-parens.openingBrackets`: the superset of supported opening delimiters.
  * Defaults to `["(", "[", "{", "<"]`.
  * Can be language specific.
* `navi-parens.closingBracketsForRaw`: the closing delimiters for `bracketScopeProvider.Raw`.
  * Defaults to `[" *)", ")", "]", "}", "</p>", "</div>"]`.
  * Can be language specific.
* `navi-parens.openingBracketsForRaw`: the opening delimiters for `bracketScopeProvider.Raw`.
  * Defaults to `["(* ", "(", "[", "{", "<p>", "<div"]`.
  * Can be language specific.
* `navi-parens.pastWordRegex`: the regular expression defining words by which the `alt+h`/`alt+;` commands navigate.
  * Defaults to `"\\p{General_Category=Letter}|[0-9]|_"`.
  * Can be language specific.



## Technical Details

See [integration tests `Extension Test Suite`](src/test/suite/extension.test.ts) for diverse behavior examples. In tests, the character `@` stands for initial cursor position, and `^` for resulting cursor position. The test names starting with `'Tricky syntax navigation:'` indicate cases where there is no unique best or most logical navigation behavior. For such cases, the behavior of _Navi Parens_ should be one that fits well in general, but might get changed if further usability corner cases arise.

_Navi Parens_ will not perform an action when it does not make logical sense, e.g. there is no outer scope to jump out of, or there is no next/previous scope within the current scope to go to the end of (even if there are more scopes outside of the current scope). This design is intentional, so that you can quickly repeat a command until you get stuck, where you can make a navigational decision (e.g. whether to leave the current scope).

One context where the current behavior might be a bit limiting is when the cursor is placed at the header line of an indentation scope, but not at the beginning of it. Jumping past next scope will find a scope nested inside the subsequent more-indented lines, rather than jumping to the end of the indentation scope. However, jumping down out of the scope will also not jump to the endo of the indentation scope, instead it will jump to outside of an encompassing scope (if any). One way to conceptualize this is to think of the header line of an indentation scope as a multi-character block scope delimiter. A position inside a delimiter is neither fully inside, nor fully outside the delimited scope.

Currently, multiple cursors are not supported. It's unlikely that I'll add multiple cursors handling, unless other users ask for it.

_Navi Parens_ ignores defined-symbols that are out-of-order with respect to the syntactic structure, e.g. Python class field definitions inside methods.

If _Navi Parens_ logs assertion failure, maybe the language has delimiters other than those in the configuration.

Some _Navi Parens_ commands will misbehave if they are executed before a document editor is fully initialized. Specifically, the `Semantic` and `JumpToBrackets` modes require the corresponding initializations, while the `Indentation` and `Raw` modes are good-to-go right away since they only look at the text of a document.

Whitespace-only lines are ignored in computing indentation scopes, which might leave to undesired behavior when you navigate out of a newly-opened line.

## Notes from a former Emacser

Coming from Emacs, I appreciate and suggest:
* Using the Breadcrumbs navigation (semantic outline) on top of editors.
* Using the Go Forward `alt+right arrow` and Go Back `alt+left arrow`.
* Mapping `Caps Lock` to `alt` (rather than `ctrl`) to facilitate using the above bindings.


## Release Notes

See the [changelog] for a detailed list of features and changes!

The main/only feature that is still missing is multiple cursors support.

### 0.9

Initial release of _Navi Parens_.

### 0.9.9

* Bug fixes, yay! And simpler code.
* When the block scope and the brackets scope are non-containing overlapping, consistently prefer the farther-out target position.
* Optimization: don't invalidate Jump-To-Bracket cache on block mode change.
* More Emacs-inspired key bindings: delete `alt+d`, delete word `ctrl+alt+d`.

### 1.0.0

* Bug fixes. No, this time for real. Better test coverage with enforced tests.
* Make the Navi-Parens-bound "move past next/previous word" consistently move past an alphanumeric word, rather than using the built-in `ctrl+rightArrow` / `ctrl+leftArrow` functionality.

### 1.0.1

* Marketplace tags for more discoverability.

### 1.1.0

* Multicharacter delimiters for the RAW brackets mode!
* Improvements to the Indentation block mode navigation.

### 1.2.0

* Bug fix in multicharacter delimiters handling.
* Improved interaction of indentation scopes and brackets scopes: when a brackets scope is intersected by the endpoint of an indentation scope, use the brackets scope for the target position.

### 1.2.1

* Clears out pending issues.
* Includes OCaml array delimiters in defaults.

### 1.2.3

* Fixes to handling indentation scopes that touch beginning/end-of-document.
* Special-case behavior where the cursor is at the start of the indentation header line.

### 2.0.0

* Introduces _Markmacs Mode_.

[changelog]: https://marketplace.visualstudio.com/items/lukstafi.navi-parens/changelog