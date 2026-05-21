/**
 * gitOps.js
 * Utilities for executing actual git commands
 * Uses simple-git library
 */

const simpleGit = require('simple-git');

class GitOperations {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Get current status in porcelain format
   * Returns array of {file, status}
   */
  async getStatus() {
    try {
      const status = await this.git.status();
      
      const files = [];
      
      // Add modified and untracked files from working directory
      if (status.files) {
        status.files.forEach(fileStatus => {
          const code = fileStatus.working_dir || fileStatus.index;
          files.push({
            file: fileStatus.path,
            status: this.parseStatusCode(code)
          });
        });
      }

      return {
        success: true,
        files,
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Stage files
   */
  async stage(filePaths) {
    try {
      if (!Array.isArray(filePaths)) {
        filePaths = [filePaths];
      }

      await this.git.add(filePaths);
      
      return {
        success: true,
        staged: filePaths
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Unstage files
   */
  async unstage(filePaths) {
    try {
      if (!Array.isArray(filePaths)) {
        filePaths = [filePaths];
      }

      await this.git.reset(['HEAD', ...filePaths]);
      
      return {
        success: true,
        unstaged: filePaths
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Create a commit
   */
  async commit(message, filePaths = []) {
    try {
      // Stage files if provided
      if (filePaths.length > 0) {
        await this.git.add(filePaths);
      }

      const result = await this.git.commit(message);
      
      return {
        success: true,
        hash: result.commit,
        message: message
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Push commits to remote
   */
  async push() {
    try {
      await this.git.push();
      
      return {
        success: true,
        message: 'Pushed successfully'
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Get commit log
   */
  async getLog(maxCount = 50) {
    try {
      const log = await this.git.log(['--oneline', `-${maxCount}`]);
      
      return {
        success: true,
        commits: log.all
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Get diff for a file
   */
  async getDiff(filePath) {
    try {
      const diff = await this.git.diff([filePath]);
      
      return {
        success: true,
        diff,
        file: filePath
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Get diff for staged files
   */
  async getDiffStaged() {
    try {
      const diff = await this.git.diff(['--cached']);
      
      return {
        success: true,
        diff
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Get current branch
   */
  async getCurrentBranch() {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return {
        success: true,
        branch: branch.trim()
      };
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Check if directory is a git repository
   */
  async isRepository() {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse git status code to readable format
   */
  parseStatusCode(code) {
    const codes = {
      'M': 'M', // Modified
      'A': 'A', // Added
      'D': 'D', // Deleted
      'R': 'R', // Renamed
      'C': 'C', // Copied
      'U': 'U', // Unmerged
      '?': '?'  // Untracked
    };
    return codes[code] || code;
  }
}

module.exports = GitOperations;