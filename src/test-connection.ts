import { Storage } from 'megajs';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
    console.log("🔄 Testing handshake with MEGA servers...");

    try {
        // The megajs wrapper signs in using just the email and password strings
        const storage = await new Storage({
            email: process.env.MEGA_EMAIL || '',
            password: process.env.MEGA_PASSWORD || ''
        }).ready;


        console.log("✅ Success! Connected to MEGA account name:", storage.name);
        console.log("📂 Root folder contains", storage.root.children?.length || 0, "top-level items.");

        process.exit(0);
    } catch (error) {
        console.error("❌ Authentication Failed! Check your email or password inside the .env file.");
        console.error(error);
        process.exit(1);
    }
}

runTest();
