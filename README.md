# RPG Quick Navigator

A VS Code extension that provides intelligent code navigation and analysis for free-form RPG files (SQLRPG will be implemented later).

## Features

### Code Analysis & Navigation
- **Symbol Explorer**: Browse all code symbols organized by category:
  - **Procedures**: All procedures (and subroutines) defined in the file
  - **Variables**: All variable declarations, together with data structures, constants and enumerations
  - **Files**: All declared file definitions (PF, LF, PRTF and DSPF)
  - **To-Do Items**: Comment-based to-do markers for code tracking

    _**To be implemented**_:
  - _**Loops & Conditionals**_: View loops and conditional blocks in the code structure; visualize code structure as a function tree
  - _**File Operations**_: Identify read/write/chain/exfmt operations on files
  - _**Usage Finder**_: Find all references to a selected symbol within the file
  - _**Passed Parameters**_: View parameters passed to procedures and subroutines
  - _**Call Hierarchy**_: Visualize procedure call relationships within the file
  - _**Code Metrics**_: Get insights on code complexity and structure
  - _**Cross-File Navigation**_: Jump to symbol definitions across multiple files in the workspace
  - _**Integration with ILE Concepts**_: Better handling of ILE-specific constructs and modules
  - _**Declaration Scope**_: Global vs local scope of variables, constants, data structures, enumerations, and subroutines
  - _**GOTO Usage Alerts**_: Warns when GOTO statements are used in free-form RPG code

### Smart Features
  - **Hover Information**: Hover over any symbol to see detailed information including type, declarations, and array dimensions (more info will be implemented later)
  - **Quick Navigation**: Click any symbol to jump directly to its definition in the editor
  - **Smart Caching**: Parsed documents are cached to avoid redundant parsing on unchanged files

    _**To be implemented**_:
  - _**Refactoring Tools**_: Rename symbols and update all references automatically
  - _**IBM i Connection**_: Integration with Code for i extension
  - _**Multi-file, workspace, and application-level handling**_: Support for analyzing and navigating symbols across multiple files, entire workspaces, and larger applications

### Sorting Options
  - **Chronological**: Sort symbols by their appearance in the source code (line number)
  - **Alphabetical**: Sort symbols alphabetically (A-Z)
  - Toggle sorting with the toolbar button or command

    _**To be implemented**_:
  - _**Filter Symbols**_: Filter symbols by type or name search

### Detailed Analysis Report
  - _**Analyze Current**_: Generate a comprehensive analysis report with statistics:
    - Symbol counts by category
    - Detailed listings with line numbers
    - Raw JSON output for advanced analysis
    - One-click JSON copy to clipboard
    _**To be implemented**_:
  - _**One-button analysis**_: Quickly generate a full analysis report with a single click.
  - _**XML/PDF support**_: Different formats for report generation
  - _**Navigation through report**_: Jump to symbol locations directly from the analysis report for quick access.
  - _**Data visualization**_: Tree-view as graph for code structure

## Supported Languages
  - Free-form RPG (`.rpg`)
  - Free-form RPGLE (`.rpgle`) (more options needed for ILE managment)
  
    _**To be implemented**_:
  - _SQL-RPGLE_ (`.sqlrpgle`)
  - _Fixed-form RPG_ (`.rpg`)

## Getting Started

### Installation
Install from VS Code Extensions Marketplace (search for "RPG Quick Navigator")

### Usage
1. Open any RPG/RPGLE file
2. The extension automatically appears in the sidebar (RPG Quick Navigator view) and in the Explorer panel
3. Browse symbols in the tree view
4. Click any symbol to navigate to its definition
5. Hover over symbols for detailed information (in tree view and editor)
6. Use "Analyze Current" command for comprehensive file analysis

## Settings
- `rpgQuickNavigator.sortOrder`: Choose between `chronological` (default) or `alphabetical` sorting

## Development

### Prerequisites
- Node.js and npm
- VS Code 1.50+

### Setup
```bash
npm install
npm run build
```

### Running
1. Press `F5` in VS Code to launch the Extension Host
2. Open or create an RPG file to test the extension (example1.rpgle is provided in the test folder with a variety of existing rpg constructs)

### Building
```bash
npm run build          # Build once
npm run build -- -w    # Watch mode
```

## Project Status
Currently in active development with core features implemented and stable.
