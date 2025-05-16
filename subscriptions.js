const fs = require('fs').promises;
const path = require('path');

class SubscriptionService {
    constructor() {
        this.csvFile = path.join(__dirname, "emails.csv");
    }

    async initializeFile() {
        try {
            await fs.access(this.csvFile);
        } catch (error) {
            // File doesn't exist, create it with headers
            await fs.writeFile(this.csvFile, "email\n");
        }
    }

    async getExistingEmails() {
        const emails = new Set();

        try {
            const content = await fs.readFile(this.csvFile, "utf-8");
            const lines = content.split("\n");

            // Skip header and empty lines
            for (let i = 1; i < lines.length; i++) {
                const email = lines[i].trim();
                if (email) {
                    emails.add(email);
                }
            }
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }

        return emails;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async addEmail(email) {
        if (!this.validateEmail(email)) {
            throw new Error("Invalid email address");
        }

        await this.initializeFile();
        const existingEmails = await this.getExistingEmails();

        if (existingEmails.has(email)) {
            throw new Error("Email already exists");
        }

        // Append the new email
        await fs.appendFile(this.csvFile, `${email}\n`);
        return "Email added successfully";
    }

    async getAllEmails() {
        await this.initializeFile();
        return Array.from(await this.getExistingEmails());
    }
}

module.exports = SubscriptionService;
