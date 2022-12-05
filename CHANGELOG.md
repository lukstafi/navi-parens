# Change Log


## [Unreleased]

### Added

- Run tests as pre-commits; setup using Husky.

### Fixed

- Fixed and further simplified the implementation of Go To Up/Down Scope.

## [0.9.9] -- 2022-11-30

### Added

- Documentation: animation explaining the non-intuitive (but intended) corner case interaction of the indentation scopes and the bracket scopes.
- Extension icon.
- Natural home-row key bindings for `Delete Right` (`alt+d`) and `Delete Word Right` (`ctrl+alt+d`).

### Fixed

- When the block scope and the brackets scope are non-containing overlapping, consistently prefer the farther-out target position.
- Many bug fixes.
- Simpler implementation of the scoping logic.
- Selection preservation for the `Select` commands.

### Changed

- Optimization: don't invalidate Jump-To-Bracket cache on block mode change.

### [0.9.0] -- 2022-11-25

### Added

- Up/Down (to outer scope) and Previous/Next (past sibling scope) navigation, combining two scoping mechanisms, each with two structure information sources: semantic block scoping with structure from symbol providers, indentation block scoping, bracket-based scoping using `Jump To Bracket`, bracket-based scoping by counting brackets/braces/parentheses.
- Begin/End scope navigation based on the above scope information. E.g. the `Go To Begin Scope` command puts the cursor close to where `Go To Up Scope` would, but on the inside of the scope rather than on the outside of it.
- `Go To Previous/Next Empty Line` (i.e. to a whitespace-only line) commands to navigate a document by "paragraphs".
- All the (relevant) commands have `Select` variants (but selection is often not yet working properly).
- Caching of `Jump To Bracket` calls, cache reset on edit.
- Configuration of the delimiter (e.g. bracket) characters used for bracket mode scoping logic.
- Configuration of structure information providers, with a pair of commands to toggle sources.
- Natural home-row key bindings for all the provided commands. The cursors are more-or-less mapped to the `J`, `K`, `L`, `I` keys.
- Natural home-row corresponding key bindings for built-in commads to expose more of the cursor movements from the "home row" key combinations. Specifically: move cursor by-character, move cursor by-word, move to begin (`Home`) and end (`End`) of a line.
- The Up/Down cursor navigation key bindings also bound for suggestion boxes.
- A configuration toggle to optionally not hide one built-in key binding (the only conflict with built-ins).
- Documentation.