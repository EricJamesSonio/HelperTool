class Item:
  def __init__(self, name, id, price):
    self.name = name
    self.id = id
    self.price = price
    
  def get_details(self):
    return f"Name : {self.name}, Id : {self.id}, Price : {self.price}"
    
    
class Menu:
  def __init__(self):
    self.inventory = []
    
  def add_item(self, item):
    self.inventory.append(item)
    print(f"Added Item : {item.get_details()}")
          
item = Item("milo", 2, 120)
print(item.get_details())

inventory = Menu()
inventory.add_item(item)