# navi-parens README

Navi Parens is a Visual Studio Code extension that provides structured code navigation similar to what's available in Emacs.
It also provides additional key bindings for moving the cursor without "fingers leaving the home row".

## Keywords

VSCode, Emacs, Structured Code Navigation, Home Row Cursor Movement

## Overview

Navi Parens provides commands for moving the cursor around smoothly from the innermost parentheses to the outermost code blocks and in between. It also offers keybindings centered around the `J, K, L, I` keys and the `Alt` modifier. E.g. moves of the cursor: `Alt+J` one character left, `Ctrl+Alt+J` one scope left, `Alt+K` one line up, `Ctrl+Alt+K` to outside the beginning of the scope around the cursor.

![Overview](animations/overview.gif)
* Activates the extension.
* Navigates in `SEM` mode across functions.
* Navigates in `SEM/JTB` mode within function.
* Switches to `IND`, navigates within function.
* Navigates across functions.
* Switches to `RAW` to demonstrate navigating within docu-comments.

## Features

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

Navi Parens combines two sources of structure information:
* Brackets, braces, parentheses.
* Code blocks.

Each of the sources comes in two variants.
* The bracket scopes come from either a judicious use of the built-in `Go to Bracket` command, or just looking for the delimiters.
* The block scopes come from either semantic symbol providers, as in the outline view, where the corresponding scope is the full range of a definition; or from indentation.

An indentation scope comprises a less-indented line followed by at least one more-indented line. The first, less-indented line is a big opening delimiter for the indentation scope: none of it is inside the scope, and only the first non-whitespace position and earlier are outside the scope. The closing delimiter is the whitespace from the end of the last indented line to before the first non-whitespace position of the less-indented following line. Currently, if there is an empty line at the end of an indentation scope, the `Go Past Next Scope` and `Go To Down Scope` commands put the cursor there.

The `Raw` mode for bracket scopes is useful as it enables navigating within comments or string literals, and does not cause "jitter" like the `JumpToBracket` mode does. However, it is less reliable since it will count brackets even if they were not intended as delimiters.

## Some use cases

First Navi Parens-specific command activates the scope navigation modes indicator.

![activation](animations/activation.gif)

Navigation with `Semantic` mode.

![Semantic](animations/semantic.gif)

Navigation with `Indentation` mode.

![Indentation](animations/indentation.gif)

Navigation with `Jump To Bracket` with block modes disabled.

![Jump To Bracket bracket scope mode](animations/jumptobracket.gif)

Navigation with `Raw` bracket mode.

![Raw bracket scope mode](animations/rawbrackets.gif)


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
  * `Indentation`: Navi Parens constructs symbols based on indentation. Details below.
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



## Quirks, Technical Details and Known Issues

See [integration tests `Extension Test Suite`](src/test/suite/extension.test.ts) for diverse behavior examples. In tests, the character `@` stands for initial cursor position, and `^` for resulting cursor position.

Currently, multiple cursors are not supported.

I ignore defined-symbols that are out-of-order with respect to the syntactic structure, e.g. Python class field definitions inside methods.

If Navi Parens logs assertion failure, maybe the language has delimiters other than those in the configuration.

When navigating down out of a scope with both indentation and bracket scopes enabled, where the scope brackets are both the first non-white characters on their lines (as often happens with braces in JSON files), the behavior can be a bit unintuitive: the cursor can end up before the closing bracket/brace. That is because we jump out of the indentation scope, since it is contained (not just overlapping) in the brackets scope. We remain within the brackets scope. It is the intended behavior.

![Indentation block scope vs brackets scope](animations/indentation-vs-brackets-outer.gif)
On the other hand, when the overlap is without inclusion, we prefer the bracket scope for navigating out of a scope.

Some Navi Parens commands will misbehave if they are executed before a document editor is fully initialized. Specifically, the `Semantic` and `JumpToBrackets` modes require the corresponding initializations, while the `Indentation` and `Raw` modes are good-to-go right away since they only look at the text of a document.

The indentation scope logic is not tailored for code mixing tab characters and spaces (issue [#4](https://github.com/lukstafi/navi-parens/issues/4)).

Whitespace-only lines are ignored in computing indentation scopes, which might leave to undesired behavior when you navigate out of a newly-opened line.

## Notes from a former Emacser

Coming from Emacs, I appreciate and suggest:
* Using the Breadcrumbs navigation (semantic outline) on top of editors.
* Using the Go Forward `alt+right arrow` and Go Back `alt+left arrow`.
* Mapping `Caps Lock` to `alt` (rather than `ctrl`) to facilitate using the above bindings.


## Release Notes

See the [changelog] for a detailed list of features and changes!

The main feature that is still missing is multiple cursors support.

### 0.9

Initial release of Navi Parens.

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

[changelog]: https://marketplace.visualstudio.com/items/lukstafi.navi-parens/changelog