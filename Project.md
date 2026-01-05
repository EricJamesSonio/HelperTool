Project :
Helper tool!


Project view:
- Can be minimize like tray icon!
- Runs as a desktop helper (no auto start)
- I manually start it, then it lives in the tray
- Basically a helper for me as a developer


Language to use:
- Electron


Features:
- Select local folder (cloned repo)
- Selected folder becomes the project root
- Generate the folder structure
- Generate code outputs (copy file contents)
- Outputs are stored outside the repo


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
  - Only display the folders! then for example, it selected a folder that has subfolder, it will also iterate that!
  - Getting all even the subfolders! so basically the starting is the selected folder!
  - Print folder structure of selected items

- If Code is chosen:
  - Copy the code content of selected files
  - If folder is selected, copy all file contents inside

- After selecting files/folders:
  - Click a "Done / Generate" button
  - Ask for name of the txt file to put the output! like "UserModule.txt"
  - Program automatically knows it if the choice is "Codes" then this txt will go inside the Codes folder of the storage!
  - if Structure then in Structure folder of the storage!
  - Then the process starts
  - Have a loading like 0% - 100% and Tell if its done!


Tray icon actions:
- Enable
- Disable
- Open helper window
- Open storage folder
- Exit
