class EngineError(Exception):
    """An error with a stable code that is safe to show to the user."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message