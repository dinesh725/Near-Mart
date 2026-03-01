const express = require("express");
const { reverseGeocode, geocodeAddress } = require("../services/geocoding");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/geocoding/reverse?lat=19.05&lng=72.83
router.get("/reverse", async (req, res, next) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ ok: false, error: "Missing lat or lng" });
        }

        // Use our backend geocoding service (Nominatim or Mapbox)
        const address = await reverseGeocode(parseFloat(lat), parseFloat(lng));
        res.json({ ok: true, address });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
