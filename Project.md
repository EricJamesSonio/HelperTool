Project :
Helper tool!


Project view:
- Can be minimized to tray icon
- Runs as a desktop helper (no auto start)
- I manually start it, then it lives in the tray
- Basically a helper for me as a developer


Language to use:
- Electron


Features:
- Select local folder (cloned repo)
- Selected folder becomes the project root
- Generate folder structure
- Generate code outputs (copy file contents)
- Outputs are stored outside the repo

Jsons for config:
- Helper config stores:
  - Base storage path
  - List of repos previously worked on
  - Mapping: repo folder → storage folder
  - Active project
- .docignore settings for the program to know what to ignore


Storage (outputs):
- Storage is NOT inside the repo
- Storage base path is fixed

Base storage path:
C:\Storage

- When I select a repo, the helper will ask:
  "What storage folder name do you want?"

- Helper will then create:

C:\Storage\<StorageName>\
  ├─ Structures\
  └─ Codes\

Example:
C:\Storage\FirstRepoStorage\
C:\Storage\Collaby\
C:\Storage\JollibeePOS\

- No extra picking
- Just name the storage
- Fast workflow

- Previously used repos are tracked in config
- Can select any previous repo → active project switches automatically
- All actions (view storage, generate structure/code) point to that repo’s storage


Storage structure:

Storage/
 ├─ Structures/
 │   ├─ Root.txt
 │   ├─ Server.txt
 │   └─ Client.txt
 │
 └─ Codes/
     ├─ UserModule.txt
     │   (Contains the code of all files inside the user module
     │    or just selected files)
     ├─ ApiModule.txt
     │   (same idea)
     └─ Other generated code outputs


Project folder display:
- Display the selected root folder
- Displayed like a tree with subtrees
- Root folder (selected cloned repo) is at the top
- Subfolders shown under it
- Files are shown inside folders
- Files can be smaller for better view
- Basically shows ALL contents of the root folder


Ignore system:
- Use a docignore file (like gitignore lol)
- docignore defines folders / files to ignore
- Ignored items:
  - Not shown in tree
  - Not included in structure
  - Not included in code generation


Selection & actions:
- Tree items are clickable
- Can select:
  - Single file
  - Multiple files
  - Single folder
  - Multiple folders
- Folder selection means:
  - Include all contents inside (recursive)

- When selecting, I choose what I want:
  - "Structure"
  - "Code"

- If Structure is chosen:
  - Only display the folders
  - If a folder has subfolders, all subfolders are included recursively
  - Print folder structure of the selected items

- Selection will be just change the color of the button if selected, double click to unselect

- If Code is chosen:
  - Display all including folders, but files are the only clickable
  - Copy the code content of selected files
  - If a folder is selected (for display purposes), all file contents inside recursively

- After selecting files/folders:
  - Click a "Done / Generate" button
  - Ask for name of the txt file to put the output (e.g., "UserModule.txt")
  - Program automatically knows:
      - If choice is "Codes" → put txt inside Codes folder of storage
      - If choice is "Structure" → put txt inside Structures folder of storage
  - Show loading progress (0% → 100%)
  - Notify when done


Tray icon actions:
- Enable
- Disable
- Open helper window
- Open storage folder (always opens storage for the active project)
- Select previously worked repo (switch active project)
- Exit


---------------------------------------------------------------------------

1️. helper-config.json — Full Structure
{
  "baseStoragePath": "C:/Storage",
  "activeProject": "D:/Projects/Collaby",
  "projects": {
    "D:/Projects/FirstRepo": {
      "storageName": "FirstRepoStorage",
      "storagePath": "C:/Storage/FirstRepoStorage",
      "lastUsed": "2026-01-05T14:20:00Z"
    },
    "D:/Projects/Collaby": {
      "storageName": "Collaby",
      "storagePath": "C:/Storage/Collaby",
      "lastUsed": "2026-01-05T15:00:00Z"
    },
    "D:/Projects/JollibeePOS": {
      "storageName": "JollibeePOS",
      "storagePath": "C:/Storage/JollibeePOS",
      "lastUsed": "2026-01-04T18:40:00Z"
    }
  },
  "preferences": {
    "docignoreFileName": ".docignore",
    "showHiddenFiles": false,
    "defaultStructureView": "tree",
    "autoSelectLastProject": true
  }
}

2️. Explanation of each field
- baseStoragePath → Fixed root folder for all storage outputs (C:\Storage)
- activeProject → Path of the currently active repo
- projects → Maps repo folder paths → storage info
  - projects[repoPath].storageName → Name of the storage folder for that repo
  - projects[repoPath].storagePath → Full path to the storage folder (C:\Storage\<StorageName>)
  - projects[repoPath].lastUsed → Optional: timestamp of last time project was active
- preferences → Global program preferences
  - preferences.docignoreFileName → Name of the ignore file to read (.docignore)
  - preferences.showHiddenFiles → Whether to show hidden/system files in tree view
  - preferences.defaultStructureView → Can be "tree" or "list" for default display
  - preferences.autoSelectLastProject → If true, app automatically selects the last used project on startup

3️. How this config is used
- Startup
  - Electron reads the config JSON from app.getPath('userData')
  - If autoSelectLastProject → sets activeProject automatically
- Selecting a repo
  - If repo exists in projects → sets activeProject
  - If new repo → prompts for storageName, creates folders, adds entry to projects
- Open Storage Folder
  - Always uses projects[activeProject].storagePath
- Generate Code / Structure
  - Writes outputs into projects[activeProject].storagePath
  - Codes → Codes/
  - Structures → Structures/
- Ignore System
  - Reads docignoreFileName in the repo root
  - Filters files/folders according to its rules

4️. Benefits of this structure
- Full history of repos → can switch back anytime
- Centralized storage info → no hard-coded paths
- Expandable preferences → can add more later (themes, display settings, etc.)
- Cross-platform safe → can adapt for Windows, Mac, Linux
