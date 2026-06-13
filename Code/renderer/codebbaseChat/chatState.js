class ChatState {
  constructor() {
    this.conversationHistory = [];
    this.activeRepoPath = null;
    this.selectedFile = null;
    this.selectedQuery = null;
    this.isLoading = false;
    this.allFiles = [];
  }

  addMessage(role, content, queryType, file) {
    this.conversationHistory.push({
      role,
      content,
      queryType: queryType || null,
      file: file || null,
      timestamp: new Date().toISOString(),
    });
  }

  replaceLastBot(content) {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'bot') {
        this.conversationHistory[i].content = content;
        return;
      }
    }
  }

  getLastBotIndex() {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i].role === 'bot') return i;
    }
    return -1;
  }

  reset() {
    this.conversationHistory = [];
    this.selectedFile = null;
    this.selectedQuery = null;
    this.isLoading = false;
  }

  setFiles(files) {
    this.allFiles = files || [];
  }
}

export default ChatState;
