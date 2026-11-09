import unittest
from totals import total_cents
class TotalsTest(unittest.TestCase):
    def test_empty(self): self.assertEqual(total_cents([]), 0)
    def test_one(self): self.assertEqual(total_cents([{'unit_cents':125,'quantity':1}]),125)
    def test_multiple(self): self.assertEqual(total_cents([{'unit_cents':125,'quantity':3},{'unit_cents':50,'quantity':2}]),475)
    def test_zero(self): self.assertEqual(total_cents([{'unit_cents':900,'quantity':0}]),0)
if __name__ == '__main__': unittest.main()
