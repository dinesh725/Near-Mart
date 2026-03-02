const mongoose = require('mongoose');
const User = require('./src/models/User');

mongoose.connect('mongodb://127.0.0.1:27017/nearmart').then(async () => {
    const result = await User.updateMany({}, { walletBalance: 10000 });
    console.log("Updated customers:", result.modifiedCount);
    process.exit(0);
}).catch(console.error);
