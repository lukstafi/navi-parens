# Change Log

## [1.1.1] -- 2022-12-20

### Fixed

- A README tweak missing from 1.1.0.

## [1.1.0] -- 2022-12-20

### Added

- Multicharacter delimiters for the RAW mode.
- More tests.

### Changed

- Unmatched brackets/parentheses now work well with the RAW mode: the scope extends to the document boundary.
- Indentation mode Next Scope / Down Scope now stops at an empty line if available: smoother navigation.

### Fixed

- Next / Previous Word navigation when there is 1 character to go past in the current word.
- Test flakiness for the Jump To Bracket mode.
- The delimiters configuration for the RAW mode is now processed / propagated.
- The JTB mode Go To Up / Down Scope code had a bug.
- Clarification and fixes to the Indentation mode semantics.

## [1.0.1] -- 2022-12-09

### Added

- Tags for Marketplace discoverability.
- A few more tests.

### Changed

- Replaced `Past` by `To` in all command titles for better discoverability.

## [1.0.0] -- 2022-12-08

### Added

- Run tests as pre-commits; setup using Husky.
- More test coverage and better test failure errors.
- Commands `goPastNextWord`, `goPastPreviousWord` that consistently move past a (unicode/alphanumeric/configurable) word, rather than using the built-in `cursorWordLeft` / `cursorWordEndRight`.


### Fixed

- Fixed and further simplified the implementation of Go To Up/Down Scope.
- Fixed and further simplified the interaction of block scopes and bracket scopes.
- Fixed indentation detection bugs.

### Changed

- Bracket scope is preferred when block and bracket scopes overlap without one including the other -- except for `Go To Begin/End Scope`, where nearer end of the two scopes is selected.

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