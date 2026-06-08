class Server:
    def __init__(self,port):
        self.port = port
        
    def run(self):
        print(f"Server is running on port {self.port}")
        
server = Server(3000)
server.run()