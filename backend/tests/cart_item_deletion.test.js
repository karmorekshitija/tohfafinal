'use strict';

const db = require('../src/config/db');

// Mock db.query before requiring controller
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

const cartController = require('../src/controllers/cart.controller');

describe('Cart Controller — Item Removal & Updating', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('removeCartItem', () => {
    test('successfully removes cart item by cart_items.id matching buyer_id or cart_id', async () => {
      req = {
        params: { id: 'c12345' },
        user: { id: 'user-789' },
      };

      db.query.mockResolvedValueOnce({ rowCount: 1 });

      await cartController.removeCartItem(req, res, next);

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('DELETE FROM cart_items');
      expect(sql).toContain('id::text = $1 OR product_id::text = $1');
      expect(sql).toContain('cart_id IN (SELECT id FROM carts WHERE user_id::text = $2)');
      expect(params).toEqual(['c12345', 'user-789']);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Item removed from cart.' },
      });
    });

    test('successfully removes cart item when product_id is passed as parameter', async () => {
      req = {
        params: { id: 'prod-uuid-999' },
        user: { id: 'user-789' },
      };

      db.query.mockResolvedValueOnce({ rowCount: 1 });

      await cartController.removeCartItem(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Item removed from cart.' },
      });
    });

    test('falls back gracefully if carts table query throws syntax/missing error', async () => {
      req = {
        params: { itemId: 'item-1' },
        user: { id: 'user-1' },
      };

      // First query with carts subquery fails (e.g., column cart_id missing)
      db.query.mockRejectedValueOnce(new Error('column cart_id does not exist'));
      // Fallback query succeeds
      db.query.mockResolvedValueOnce({ rowCount: 1 });

      await cartController.removeCartItem(req, res, next);

      expect(db.query).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Item removed from cart.' },
      });
    });

    test('returns 404 if item does not exist or user does not own it', async () => {
      req = {
        params: { id: 'non-existent-id' },
        user: { id: 'user-789' },
      };

      db.query.mockResolvedValueOnce({ rowCount: 0 });

      await cartController.removeCartItem(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cart item not found.',
      });
    });

    test('returns 400 if item ID is missing', async () => {
      req = {
        params: {},
        body: {},
        user: { id: 'user-789' },
      };

      await cartController.removeCartItem(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cart item ID is required.',
      });
    });
  });

  describe('updateCartItem', () => {
    test('successfully updates item quantity using casted ID and ownership query', async () => {
      req = {
        params: { id: 'ci-100' },
        body: { quantity: 3 },
        user: { id: 'user-789' },
      };

      db.query.mockResolvedValueOnce({
        rows: [{ id: 'ci-100', quantity: 3 }],
      });

      await cartController.updateCartItem(req, res, next);

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('UPDATE cart_items SET quantity = $1');
      expect(sql).toContain('id::text = $2 OR product_id::text = $2');
      expect(params).toEqual([3, 'ci-100', 'user-789']);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cart item updated successfully.',
        data: { cartItem: { id: 'ci-100', quantity: 3 } },
      });
    });
  });

  describe('clearCart', () => {
    test('clears cart items for buyer', async () => {
      req = {
        user: { id: 'user-789' },
      };

      db.query.mockResolvedValueOnce({ rowCount: 3 });

      await cartController.clearCart(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Cart cleared.' },
      });
    });
  });
});
