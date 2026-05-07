const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

// Generate JWT token
function generateToken(userId, email) {
  return jwt.sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
}

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
    });

    // Generate token
    const token = generateToken(user._id, user.email);

    console.log(`✅ New user registered: ${user.email}`);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });

  } catch (err) {
    console.error('Signup error:', err);
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.email);

    console.log(`✅ User logged in: ${user.email}`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });

  } catch (err) {
    console.error('Login error:', err);
    next(err);
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        preferences: user.preferences,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });

  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, preferences } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        preferences: user.preferences,
      },
    });

  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    console.log(`✅ Password changed for user: ${user.email}`);

    res.json({ message: 'Password changed successfully' });

  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-token - Check if token is valid
router.post('/verify-token', authenticate, (req, res) => {
  res.json({
    valid: true,
    userId: req.userId,
    email: req.userEmail,
  });
});

module.exports = router;