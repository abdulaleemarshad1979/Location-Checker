module.exports = {
    port: process.env.PORT || 6589,
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin",
    token: process.env.ADMIN_TOKEN || "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ""
}