class Item:
  def __init__(self, name, id, price):
    self.name = name
    self.id = id
    self.price = price
    
  def get_details(self):
    return f"Name : {self.name}, Id : {self.id}, Price : {self.price}"
    
class MenuItem:
  def __init__(self, item, quantity):
    self.item = item
    self.quantity = quantity
    
  def get_details(self):
    return f"Item : {self.item.get_details()}, Quantity : {self.quantity}"
    
class Store:
  def __init__(self):
    self.store = []
    
  def add_item(self, item, quantity):
    new_item = MenuItem(item, quantity)
    
    
  def find_item(self, id):
    for item in self.store:
      if item.id == id:
        return item
      else:
        return None    