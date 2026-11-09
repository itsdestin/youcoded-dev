def total_cents(items):
    """Return total price in integer cents; quantities may be zero."""
    return sum(item['unit_cents'] * item['quantity'] for item in items)
