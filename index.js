const port = process.env.PORT || 4001;
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcrypt"); 
require("dotenv").config();

app.use(express.json());
app.use(cors());

// lidhja me MongoDB
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("MongoDB Error:", err));

// test
app.get("/", (req, res) => {
    res.send("Express app is running");
});

// ================= IMAGE UPLOAD =================
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

// ================= USER MODEL =================
const User = mongoose.model('User', {
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
    },
    password: {
        type: String,
    },
    role: {
        type: String,
        default: "user"
    },
    cartData: {
        type: Object,
    },
    date: {
        type: Date,
        default: Date.now,
    }
});

// ================= SIGNUP =================
app.post('/signup', async (req, res) => {
    let check = await User.findOne({ email: req.body.email });
    if (check) {
        return res.status(400).json({
            success: false,
            errors: 'Ekziston nje user me te njejten adrese email-i'
        });
    }

    let cart = {};
    for (let i = 0; i < 300; i++) {
        cart[i] = 0;
    }

    // 🔐 HASH PASSWORD
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    const user = new User({
        name: req.body.username,
        email: req.body.email,
        password: hashedPassword,
        cartData: cart,
    });

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    };

    const token = jwt.sign(data, process.env.JWT_SECRET);

    res.json({ success: true, token });
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {
    let user = await User.findOne({ email: req.body.email });

    if (user) {

        let isMatch = false;

        // 🔐 nëse është hash
        if (user.password.startsWith("$2b$")) {
            isMatch = await bcrypt.compare(req.body.password, user.password);
        } 
        // 🔧 user i vjetër (plain text)
        else {
            if (req.body.password === user.password) {
                isMatch = true;

                // 👉 konverto në hash
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(req.body.password, salt);
                await user.save();
            }
        }

        if (isMatch) {
            const data = {
                user: {
                    id: user.id
                }
            };

            const token = jwt.sign(data, process.env.JWT_SECRET);

            res.json({
                success: true,
                token,
                role: user.role
            });

        } else {
            res.json({ success: false, errors: "Wrong password" });
        }

    } else {
        res.json({ success: false, errors: "Wrong email id" });
    }
});

// ================= MULTER =================
const upload = multer({ storage: storage });

app.use('/images', express.static('upload/images'));

app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: `http://localhost:${port}/images/${req.file.filename}`
    });
});

// ================= PRODUCT MODEL =================
const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
});

// ================= ADD PRODUCT =================
app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;

    if (products.length > 0) {
        let last_product = products.slice(-1)[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }

    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
    });

    await product.save();

    res.json({
        success: true,
        name: req.body.name,
    });
});

// ================= REMOVE PRODUCT =================
app.post('/removeproduct', async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({
        success: true,
        name: req.body.name,
    });
});

// ================= GET PRODUCTS =================
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    res.send(products);
});

app.get('/newcollection', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    res.send(newcollection);
});

app.get('/popularinwomen', async (req, res) => {
    let products = await Product.find({ category: "femra" });
    let popular_in_women = products.slice(0, 4);
    res.send(popular_in_women);
});

// ================= AUTH MIDDLEWARE =================
const fetchuser = async (req, res, next) => {
    const token = req.header("auth-token");

    if (!token) {
        return res.status(401).send({ errors: "Please authenticate" });
    }

    try {
        const data = jwt.verify(token, process.env.JWT_SECRET);
        req.user = data.user;
        next();
    } catch {
        res.status(401).send({ errors: "Invalid token" });
    }
};

// ================= CART =================
app.post('/addtocart', fetchuser, async (req, res) => {
    let userData = await User.findOne({ _id: req.user.id });
    userData.cartData[req.body.itemId] += 1;

    await User.findOneAndUpdate(
        { _id: req.user.id },
        { cartData: userData.cartData }
    );

    res.send("Added");
});

app.post('/removefromcart', fetchuser, async (req, res) => {
    let userData = await User.findOne({ _id: req.user.id });

    if (userData.cartData[req.body.itemId] > 0)
        userData.cartData[req.body.itemId] -= 1;

    await User.findOneAndUpdate(
        { _id: req.user.id },
        { cartData: userData.cartData }
    );

    res.send("Removed");
});

// ================= SERVER =================
app.listen(port, (error) => {
    if (!error) {
        console.log("Server running on Port " + port);
    } else {
        console.log("Error:" + error);
    }
});