const http = require('http');

let token = '';

// 1. Fetch Demo Token
const authReq = http.request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/demo/customer',
    method: 'POST',
    headers: { 'Content-Length': 0 }
}, (res) => {
    let rawData = '';
    res.on('data', chunk => rawData += chunk);
    res.on('end', () => {
        try {
            const authData = JSON.parse(rawData);
            if (!authData.ok || !authData.accessToken) {
                return console.error("Auth failed:", authData);
            }
            token = authData.accessToken;
            fetchProducts();
        } catch (e) { console.error(e); }
    });
});
authReq.end();

// 2. Fetch active products
function fetchProducts() {
    http.get('http://127.0.0.1:5000/api/products', (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
            const data = JSON.parse(rawData);
            if (!data.ok || !data.products) return console.error("Failed to get products");

            const getSellerId = (p) => (typeof p.sellerId === 'object' ? String(p.sellerId._id) : String(p.sellerId));

            let p1 = data.products[0];
            let p2 = data.products.find(p => getSellerId(p) !== getSellerId(p1));

            if (!p2) {
                console.log("⚠️ Could not find products with 2 distinct sellers.");
                return;
            }

            console.log(`Using Product 1: ${p1.name} (Seller: ${getSellerId(p1)})`);
            console.log(`Using Product 2: ${p2.name} (Seller: ${getSellerId(p2)})`);
            runCheckout(p1._id, p2._id);
        });
    });
}

// 3. Run Checkout
function runCheckout(id1, id2) {
    const data = JSON.stringify({
        items: [
            { productId: id1, qty: 2 },
            { productId: id2, qty: 1 }
        ],
        address: "Test Multi-Seller Address",
        paymentMethod: "razorpay",
        dropLocation: { lat: 19.07, lng: 72.87, address: "Test Multi-Seller Address" }
    });

    const options = {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/payments/checkout',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Authorization': `Bearer ${token}`
        }
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
            console.log(`\nCHECKOUT STATUS: ${res.statusCode}`);
            console.log(`BODY: ${responseData}\n`);
            try {
                const parsed = JSON.parse(responseData);
                if (parsed.orders && parsed.orders.length > 1) {
                    console.log('✅✅ Multi-seller split successful! ✅✅');
                    console.log(`Number of orders created: ${parsed.orders.length}`);
                    parsed.orders.forEach((o, i) => {
                        console.log(`Order ${i + 1} ID: ${o._id}, Total: ₹${o.total}, Seller ID: ${o.sellerId}, Status: ${o.status}`);
                    });
                } else if (parsed.orders) {
                    console.log('⚠️ Only one order returned. Ensure cart products have distinct sellerIds.');
                }
            } catch (e) { }
        });
    });

    req.on('error', (e) => console.error(e));
    req.write(data);
    req.end();
}
