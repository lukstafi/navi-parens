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

Currently, Navi Parens uses two sources of structure information:
* a judicious use of the built-in `Go to Bracket` command,
* defined-symbols, as in the outline view, where the corresponding scope is the full range of a definition.

In languages like Python these sources can be less-than-ideal. In the future, I might try to incorporate the scopes available to fold/unfold. Unfortunately, the fold/unfold scopes do not seem easily available to VSCode extensions.

## TODO: provide some animations

Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Extension Settings

This extension contributes the following settings:

* `navi-parens.enable`: [`true`] Enable/disable this extension.
* `navi-parens.rebind`: [`true`] How to deal with the `shift+alt+i` binding conflict.
** If `true`:
*** rebind `insertCursorAtEndOfEachLineSelected` from `shift+alt+i` to `shift+alt+p`
*** bind `cursorUpSelect` to `shift+alt+i`
*** do not make bindings for `ctrl+alt+o`.
** If `false`:
*** bind `cursorUpSelect` to `ctrl+shift+alt+o`
*** bind `cursorUp` to both `alt+i` and `ctrl+alt+o`.


## Technical Details and Known Issues

TODO? As an optimization, the defined-symbols are only recomputed on edit when the cursor needs to leave its current line.

Currently, multiple cursors are not supported.

I ignore defined-symbols that are out-of-order with respect to the syntactic structure, e.g. Python class field definitions inside methods.

To simplify the implementation, navigating up or down a scope advances the cursor if possible. This is usually the desired behavior, but reduces a bit the flexibility of navigating scopes with empty (closing) delimiters.

Currently, navigating scopes with multicharacter closing brackets might not work well.

Currently, interaction of brackets with definitions can be undesirable in e.g. JavaScript with definitions inside a `for` loop header or `if` condition. I plan to fix it.

If Navi Parens logs assertion failure, maybe the language has delimiters other than the currently hard-coded `(), [], {}, <>`.


## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.
