class Item:
    def __init__(self, name, id , price):
        self.name = name
        self.id = id
        self.price = price
    
    def get_details(self):
        return f"Item: {self.name}, ID: {self.id}, Price: ${self.price}"
    
class Drinks(Item):
    def __init__(self, name, id, price, volume):
        super().__init__(name, id, price)
        self.volume = volume
        
    def get_details(self):
        return f"Drink: {self.name}, ID: {self.id}, Price: ${self.price}, Volume: {self.volume}ml"
    
class Food(Item):
    def __init__(self, name, id, price, calories):
        super().__init__(name, id, price)
        self.calories = calories
        
    def get_details(self):
        return f"Food: {self.name}, ID: {self.id}, Price: ${self.price}, Calories: {self.calories}kcal"
    
