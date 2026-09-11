require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zchat';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET must be set in your .env file.');
}

const uploadsDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDirectory));

app.get('/', (_req, res) => {
  res.json({ message: 'Z-Chat API is running', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting' });
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: '' },
  avatarStyle: { type: String, default: 'aurora' },
  bio: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
  ,lastActive: { type: Date, default: Date.now }
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true },
  image: { type: String, default: '' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true }
  }]
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '', trim: true },
  media: { type: String, default: '' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

const storySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  image: { type: String, required: true },
  caption: { type: String, default: '', trim: true, maxlength: 180 },
  reactions: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, emoji: { type: String, default: '♥' } }],
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Message = mongoose.model('Message', messageSchema);
const Story = mongoose.model('Story', storySchema);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'))
});

function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication token required' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    User.updateOne({ _id: req.user.userId }, { lastActive: new Date() }).catch(() => {});
    next();
  } catch {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    bio: user.bio,
    followers: user.followers,
    following: user.following
  };
}

app.post('/api/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Username, email, and password are required' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ $or: [{ username: username.trim() }, { email: normalizedEmail }] })) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }
    const user = await User.create({ username: username.trim(), email: normalizedEmail, password: await bcrypt.hash(password, 12) });
    const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: '7d' });
    res.status(201).json({ message: 'User registered successfully', token, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password' });
    const token = jwt.sign({ userId: user._id }, jwtSecret, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/user/current', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) { next(error); }
});

app.get('/api/user/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) { next(error); }
});

app.put('/api/user/profile', authenticateToken, upload.single('profilePicture'), async (req, res, next) => {
  try {
    const update = { bio: req.body.bio || '', avatarStyle: req.body.avatarStyle || 'aurora' };
    if (req.file) update.profilePicture = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user.userId, update, { new: true }).select('-password');
    res.json(user);
  } catch (error) { next(error); }
});

app.post('/api/posts', authenticateToken, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.body.content?.trim()) return res.status(400).json({ message: 'Post content is required' });
    const post = await Post.create({ userId: req.user.userId, content: req.body.content.trim(), image: req.file ? `/uploads/${req.file.filename}` : '' });
    res.status(201).json(await post.populate('userId', 'username profilePicture'));
  } catch (error) { next(error); }
});

app.get('/api/stories', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('friends');
    const visibleUserIds = [req.user.userId, ...(user?.friends || [])];
    res.json(await Story.find({ userId: { $in: visibleUserIds }, expiresAt: { $gt: new Date() } })
      .populate('userId', 'username profilePicture')
      .sort({ createdAt: -1 }));
  } catch (error) { next(error); }
});

app.post('/api/stories/:id/react', authenticateToken, async (req, res, next) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || story.expiresAt <= new Date()) return res.status(404).json({ message: 'Story not found' });
    const index = story.reactions.findIndex((reaction) => reaction.userId.equals(req.user.userId));
    if (index >= 0) story.reactions.splice(index, 1); else story.reactions.push({ userId: req.user.userId, emoji: req.body.emoji || '♥' });
    await story.save();
    res.json({ reacted: index < 0, reactionsCount: story.reactions.length });
  } catch (error) { next(error); }
});

app.post('/api/stories', authenticateToken, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose an image for your story' });
    const story = await Story.create({
      userId: req.user.userId,
      image: `/uploads/${req.file.filename}`,
      caption: req.body.caption || '',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    res.status(201).json(await story.populate('userId', 'username profilePicture'));
  } catch (error) { next(error); }
});

app.get('/api/posts', authenticateToken, async (_req, res, next) => {
  try { res.json(await Post.find().populate('userId', 'username profilePicture').populate('comments.userId', 'username profilePicture').sort({ createdAt: -1 })); }
  catch (error) { next(error); }
});

app.put('/api/posts/:id/like', authenticateToken, async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const index = post.likes.findIndex((id) => id.equals(req.user.userId));
    if (index >= 0) post.likes.splice(index, 1); else post.likes.push(req.user.userId);
    await post.save();
    res.json({ liked: index < 0, likesCount: post.likes.length });
  } catch (error) { next(error); }
});

app.post('/api/posts/:id/save', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    const post = await Post.exists({ _id: req.params.id });
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const index = user.savedPosts.findIndex((id) => id.equals(req.params.id));
    if (index >= 0) user.savedPosts.splice(index, 1); else user.savedPosts.push(req.params.id);
    await user.save();
    res.json({ saved: index < 0 });
  } catch (error) { next(error); }
});

app.get('/api/posts/saved', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).populate({
      path: 'savedPosts',
      populate: [{ path: 'userId', select: 'username profilePicture' }, { path: 'comments.userId', select: 'username profilePicture' }]
    });
    res.json((user?.savedPosts || []).sort((a, b) => b.createdAt - a.createdAt));
  } catch (error) { next(error); }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res, next) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!post) return res.status(404).json({ message: 'Post not found or you cannot delete it' });
    await Promise.all([Post.deleteOne({ _id: post._id }), User.updateMany({ savedPosts: post._id }, { $pull: { savedPosts: post._id } })]);
    res.json({ message: 'Post deleted' });
  } catch (error) { next(error); }
});

app.post('/api/posts/:id/comments', authenticateToken, async (req, res, next) => {
  try {
    if (!req.body.text?.trim()) return res.status(400).json({ message: 'Comment text is required' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.comments.push({ userId: req.user.userId, text: req.body.text.trim() });
    await post.save();
    res.status(201).json(await Post.findById(post._id).populate('userId', 'username profilePicture').populate('comments.userId', 'username profilePicture'));
  } catch (error) { next(error); }
});

app.post('/api/users/:id/follow', authenticateToken, async (req, res, next) => {
  try {
    if (req.params.id === String(req.user.userId)) return res.status(400).json({ message: "You can't follow yourself" });
    const [currentUser, userToFollow] = await Promise.all([User.findById(req.user.userId), User.findById(req.params.id)]);
    if (!userToFollow) return res.status(404).json({ message: 'User not found' });
    const index = currentUser.following.findIndex((id) => id.equals(userToFollow._id));
    if (index >= 0) { currentUser.following.splice(index, 1); userToFollow.followers.pull(currentUser._id); }
    else { currentUser.following.push(userToFollow._id); userToFollow.followers.push(currentUser._id); }
    await Promise.all([currentUser.save(), userToFollow.save()]);
    res.json({ following: index < 0 });
  } catch (error) { next(error); }
});

app.get('/api/users/:id/posts', authenticateToken, async (req, res, next) => {
  try { res.json(await Post.find({ userId: req.params.id }).populate('userId', 'username profilePicture').populate('comments.userId', 'username profilePicture').sort({ createdAt: -1 })); }
  catch (error) { next(error); }
});

app.get('/api/users', authenticateToken, async (_req, res, next) => {
  try { res.json(await User.find().select('-password')); }
  catch (error) { next(error); }
});

app.get('/api/friends', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('friends', 'username profilePicture bio lastActive')
      .populate('friendRequests', 'username profilePicture bio lastActive');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ friends: user.friends, requests: user.friendRequests });
  } catch (error) { next(error); }
});

app.get('/api/notifications', authenticateToken, async (req, res, next) => {
  try {
    const [user, unreadMessages] = await Promise.all([
      User.findById(req.user.userId).select('friendRequests'),
      Message.countDocuments({ receiverId: req.user.userId, read: false })
    ]);
    res.json({ friendRequests: user?.friendRequests?.length || 0, unreadMessages });
  } catch (error) { next(error); }
});

app.post('/api/friends/:id/request', authenticateToken, async (req, res, next) => {
  try {
    if (req.params.id === String(req.user.userId)) return res.status(400).json({ message: "You can't add yourself" });
    const [sender, receiver] = await Promise.all([User.findById(req.user.userId), User.findById(req.params.id)]);
    if (!receiver) return res.status(404).json({ message: 'User not found' });
    if (sender.friends.some((id) => id.equals(receiver._id))) return res.status(400).json({ message: 'You are already friends' });
    if (receiver.friendRequests.some((id) => id.equals(sender._id))) return res.status(400).json({ message: 'Friend request already sent' });
    receiver.friendRequests.push(sender._id);
    await receiver.save();
    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) { next(error); }
});

app.post('/api/friends/:id/respond', authenticateToken, async (req, res, next) => {
  try {
    const accept = req.body.accept === true;
    const [currentUser, requester] = await Promise.all([User.findById(req.user.userId), User.findById(req.params.id)]);
    if (!requester || !currentUser.friendRequests.some((id) => id.equals(requester._id))) return res.status(404).json({ message: 'Friend request not found' });
    currentUser.friendRequests.pull(requester._id);
    if (accept) { currentUser.friends.push(requester._id); requester.friends.push(currentUser._id); }
    await Promise.all([currentUser.save(), requester.save()]);
    res.json({ message: accept ? 'Friend request accepted' : 'Friend request declined' });
  } catch (error) { next(error); }
});

app.post('/api/messages', authenticateToken, upload.single('media'), async (req, res, next) => {
  try {
    if (!req.body.receiverId || (!req.body.content?.trim() && !req.file)) return res.status(400).json({ message: 'Add a message or media file' });
    const message = await Message.create({ senderId: req.user.userId, receiverId: req.body.receiverId, content: req.body.content?.trim() || '', media: req.file ? `/uploads/${req.file.filename}` : '' });
    res.status(201).json(await message.populate([{ path: 'senderId', select: 'username profilePicture' }, { path: 'receiverId', select: 'username profilePicture' }]));
  } catch (error) { next(error); }
});

app.get('/api/messages/:userId', authenticateToken, async (req, res, next) => {
  try {
    await Message.updateMany({ senderId: req.params.userId, receiverId: req.user.userId, read: false }, { read: true });
    res.json(await Message.find({ $or: [{ senderId: req.user.userId, receiverId: req.params.userId }, { senderId: req.params.userId, receiverId: req.user.userId }] }).populate('senderId', 'username profilePicture').populate('receiverId', 'username profilePicture').sort({ createdAt: 1 }));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.name === 'ValidationError' ? 400 : 500).json({ message: error.message || 'Internal server error' });
});

mongoose.connect(mongoUri)
  .then(() => app.listen(port, () => console.log(`Z-Chat server running on port ${port}`)))
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
