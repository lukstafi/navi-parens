# navi-parens README

Navi Parens is a Visual Studio Code extension that provides structured code navigation similar to what's available in Emacs.
It also provides additional key bindings for moving the cursor without "fingers leaving the home row".

## Keywords

VSCode, Emacs, Structured Code Navigation, Home Row Cursor Movement

## Features

Commands:
* `goPastNextScope`: `ctrl+alt+l` Go past the next same-level closing bracket/scope
* `goPastPreviousScope`: `ctrl+alt+j` Go to the previous same-level opening bracket/scope
* `goToUpScope`: `ctrl+alt+i` Go outside the opening of the current level
* `goToDownScope`: `ctrl+alt+k` Go outside the closing of the current level
* `goToBeginScope`: `ctrl+alt+a` Go near the opening of the current level but stay inside scope
* `goToEndScope`: `ctrl+alt+k` Go near the closing of the current level but stay inside scope
* `goToPreviousEmptyLine`: `ctrl+alt+h` Go to the previous line with only whitespace (or empty)
* `goToNextEmptyLine`: `ctrl+alt+;` Go to the next line with only whitespace (or empty)
* `selectToNextScope`: `shift+ctrl+alt+l` Select past the next same-level closing bracket/scope
* `selectToPreviousScope`: `shift+ctrl+alt+j` Select to the previous same-level opening bracket/scope
* `selectToUpScope`: `shift+ctrl+alt+i` Select till outside the opening of the current level
* `selectToDownScope`: `shift+ctrl+alt+k` Select till outside the closing of the current level
* `selectToBeginScope`: `shift+ctrl+alt+a` Select to near the opening of the current level but stay inside scope
* `selectToEndScope`: `shift+ctrl+alt+k` Select to near the closing of the current level but stay inside scope
* `selectToPreviousEmptyLine`: `shift+ctrl+alt+h` Select to the previous line with only whitespace (or empty)
* `selectToNextEmptyLine`: `shift+ctrl+alt+;` Select to the next line with only whitespace (or empty)
* `cycleBracketScopeMode`: `ctrl+alt+p` Cycle through the bracket scope logic (`ctrl+shift+\`, delimiter counting)
* `cycleBlockScopeMode`: `shift+ctrl+alt+p` Cycle through block scope logic (symbols, indentation, none)

The meaning of "near the beginning/end of a scope" is mode-specific.

Extra key bindings:
* `insertCursorAtEndOfEachLineSelected`: rebound from `shift+alt+i` to `shift+alt+p`
* `cursorRight`: `alt+l`
* `cursorLeft`: `alt+j`
* `cursorUp`: `alt+i`
* `cursorDown`: `alt+k`
* `cursorHome`: `alt+a`
* `cursorEnd`: `alt+e`
* `cursorWordLeft`: `alt+h`
* `cursorWordEndRight`: `alt+;`
* `cursorRightSelect`: `shift+alt+l`
* `cursorLeftSelect`: `shift+alt+j`
* `cursorUpSelect`: `shift+alt+i`
* `cursorDownSelect`: `shift+alt+k`
* `cursorHomeSelect`: `shift+alt+a`
* `cursorEndSelect`: `shift+alt+e`
* `cursorWordLeftSelect`: `shift+alt+h`
* `cursorWordEndRightSelect`: `shift+alt+;`

Navi Parens combines two sources of structure information:
* Brackets, braces, parentheses.
* Code blocks.

Each of the sources comes in two variants.
* The bracket scopes come from either a judicious use of the built-in `Go to Bracket` command, or just looking for the delimiter characters.
* The block scopes come from either semantic symbol providers, as in the outline view, where the corresponding scope is the full range of a definition; or from indentation.

An indentation scope comprises a less-indented line followed by at least one more-indented line.


## TODO: provide some animations

Image paths are relative to this README file.

\!\[feature X\]\(animations/feature-x.png\)

## Extension Settings

This extension contributes the following settings:

* `navi-parens.rebind`: How to deal with the `shift+alt+i` binding conflict.
** Defaults to `true`.
** If `true`:
*** rebind `insertCursorAtEndOfEachLineSelected` from `shift+alt+i` to `shift+alt+p`
*** bind `cursorUpSelect` to `shift+alt+i`
*** do not make bindings for `ctrl+alt+o`.
** If `false`:
*** bind `cursorUpSelect` to `ctrl+shift+alt+o`
*** bind `cursorUp` to both `alt+i` and `ctrl+alt+o`.
* `navi-parens.blockScopeMode`: an enum selecting where the non-bracket structure information comes from.
** `Semantic`: the semantic analyzers integrated with VSCode. The default.
** `Indentation`: Navi Parens constructs symbols based on indentation. Details below.
** `None`: same behavior as if there were no symbol definitions in text.
** `ctrl+shift+alt+p` toggles between `Semantic` and `Indentation`.
* `navi-parens.bracketScopeMode`: an enum selecting how to get the bracket structure information.
** `JumpToBracket`: uses `editor.action.jumpToBracket` (i.e. `ctrl+shift+\`). The default.
** `Raw`: only the bracket characters are considered, without context.
** `ctrl+shift+alt+p` toggles between `Semantic` and `Raw`.
* `navi-parens.closingBrackets`: the superset of supported closing delimiters.
** Defaults to `[")", "]", "}", ">"]`. The default setting might be sufficient for all use cases.
** Can be language specific.
* `navi-parens.openingBrackets`: the superset of supported opening delimiters.
** Defaults to `["(", "[", "{", "<"]`. The default setting might be sufficient for all use cases.
** Can be language specific.
* `navi-parens.closingBracketsForRaw`: the closing delimiters for `bracketScopeProvider.Raw`.
** Defaults to `[")", "]", "}"]`. The default setting might be sufficient for all use cases.
** Can be language specific.
* `navi-parens.openingBracketsForRaw`: the opening delimiters for `bracketScopeProvider.Raw`.
** Defaults to `["(", "[", "{"]`. The default setting might be sufficient for all use cases.
** Can be language specific.



## Technical Details and Known Issues

TODO? As an optimization, the defined-symbols are only recomputed on edit when the cursor needs to leave its current line.

Currently, multiple cursors are not supported.

I ignore defined-symbols that are out-of-order with respect to the syntactic structure, e.g. Python class field definitions inside methods.

To simplify the implementation, navigating up or down a scope advances the cursor if possible. This is usually the desired behavior, but reduces a bit the flexibility of navigating scopes with empty (closing) delimiters. (TODO: is this still true?)

Currently, navigating scopes with multicharacter closing brackets might not work well.

Currently, interaction of brackets with definitions can be undesirable in e.g. JavaScript with definitions inside a `for` loop header or `if` condition. I plan to fix it. (TODO: what's the status?)

If Navi Parens logs assertion failure, maybe the language has delimiters other than those in the configuration.

TODO: minimize state update on switching between symbol providers.

## Notes from a former Emacser

Coming from Emacs, I appreciate and suggest:
* Using the Breadcrumbs navigation (semantic outline) on top of editors.
* Using the Go Forward `alt+right arrow` and Go Back `alt+left arrow`.
* Mapping `Caps Lock` to `alt` (rather than `ctrl`) to facilitate using the above bindings.


## Release Notes

### 1.0

Initial release of Navi Parens. The main missing features are multiple cursors support and multicharacter delimiters support.

## Planned Releases

### 1.1

Bug fixes.

### 2.0

Multiple cursors support. Multicharacter delimiters support.

### 2.1

Bug fixes.