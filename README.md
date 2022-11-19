# navi-parens README

Navi Parens is a Visual Studio Code extension that provides structured code navigation similar to what's available in Emacs.
Over time it might also include some other functionality and configuration that I find useful.

## Features

Commands:
* `goPastNextScope`: `ctrl+alt+l` Go past the next same-level closing bracket/scope
* `goPastPreviousScope`: `ctrl+alt+j` Go to the previous same-level opening bracket/scope
* `goToUpScope`: `ctrl+alt+i` Go outside the opening of the current level
* `goToDownScope`: `ctrl+alt+k` Go outside the closing of the current level
* `selectToNextScope`: `shift+ctrl+alt+l` Select past the next same-level closing bracket/scope
* `selectToPreviousScope`: `shift+ctrl+alt+j` Select to the previous same-level opening bracket/scope
* `selectToUpScope`: `shift+ctrl+alt+i` Select till outside the opening of the current level
* `selectToDownScope`: `shift+ctrl+alt+k` Select till outside the closing of the current level
* `toggleBracketScopeProvider`: `ctrl+alt+p` Switch between "semantic" and "raw" bracket scope logic
* `toggleIndentScopeMode`: `ctrl+shift+alt+p` Switch between "semantic" and "indentation" scope logic

Extra key bindings:
* `insertCursorAtEndOfEachLineSelected`: rebound from `shift+alt+i` to `shift+alt+p`
* `cursorRight`: `alt+l`
* `cursorLeft`: `alt+j`
* `cursorUp`: `alt+i`
* `cursorDown`: `alt+k`
* `cursorRightSelect`: `shift+alt+l`
* `cursorLeftSelect`: `shift+alt+j`
* `cursorUpSelect`: `shift+alt+i`
* `cursorDownSelect`: `shift+alt+k`

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
* `navi-parens.symbolProvider`: an enum selecting where the non-bracket structure information comes from.
** `Semantic`: the semantic analyzers integrated with VSCode. The default.
** `Indentation`: Navi Parens constructs symbols based on indentation. Details below.
** `None`: same behavior as if there were no symbol definitions in text.
** `ctrl+shift+alt+p` toggles between `Semantic` and `Indentation`.
* `navi-parens.bracketScopeProvider`: an enum selecting how to get the bracket structure information.
** `Semantic`: uses `editor.action.jumpToBracket` (i.e. `ctrl+shift+\`). The default.
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