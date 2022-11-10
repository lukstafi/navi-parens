# navi-parens README

This is the README for your extension "navi-parens". It provides structured code navigation similar to what's available in Emacs.
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

## TODO: remaining auto-generated suggested sections

Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

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
