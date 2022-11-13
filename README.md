# navi-parens README

Navi Parens is a Visual Studio Code extension that provides structured code navigation similar to what's available in Emacs.
Over time it might also include some other functionality and configuration that I find useful.

## Features

Commands:
* `goToNextBracket`: `ctrl+alt+l` Go past the next same-level closing bracket/scope
* `goToPreviousBracket`: `ctrl+alt+j` Go to the previous same-level opening bracket/scope
* `goToUpBracket`: `ctrl+alt+i` Go outside the opening of the current level
* `goToDownBracket`: `ctrl+alt+k` Go outside the closing of the current level
* `selectToNextBracket`: `shift+ctrl+alt+l` Select past the next same-level closing bracket/scope
* `selectToPreviousBracket`: `shift+ctrl+alt+j` Select to the previous same-level opening bracket/scope
* `selectToUpBracket`: `shift+ctrl+alt+i` Select till outside the opening of the current level
* `selectToDownBracket`: `shift+ctrl+alt+k` Select till outside the closing of the current level

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

When navigating scopes with empty (closing) delimiters, Navi Parens keeps track of the exact current scope and changes scopes without changing cursor position when needed.

Currently, Navi Parens uses two sources of structure information:
* a judicious use of the built-in `Go to Bracket` command,
* defined-symbols, as in the outline view, where the corresponding scope is the full range of a definition.

In languages like Python these sources can be less-than-ideal. In the future, I might try to incorporate the scopes available to fold/unfold. Unfortunately, the fold/unfold scopes do not seem easily available to VSCode extensions.

## TODO: remaining auto-generated suggested sections

Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

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


## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
