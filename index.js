const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { parse } = require("node-html-parser");
const SubscriptionService = require("./subscriptions");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const subscriptionService = new SubscriptionService();

let lastNoticeNumber = 150520258936;

function extractNoticeNumber(url) {
    if (!url) return 0;
    const match = url.match(/\/(\d+)\./);
    return match ? parseInt(match[1]) : 0;
}

async function fetchAndCheckNotices() {
    try {
        const response = await axios.get(
            "https://exp.sunnythedeveloper.in/scrapper.php"
        );
        const json = await response.data;

        if (!json.success) {
            throw new Error(json.error || "Failed to fetch data");
        }

        const html = json.data;
        const root = parse(html);
        const notices = [];

        const noticeTable = root.querySelector(
            "#ContentPlaceHolder2_ContentPlaceHolder3_GridView1"
        );

        if (!noticeTable) {
            return { notices, newNotices: [] };
        }

        const rows = noticeTable.querySelectorAll("tr");

        // Skip the header row (i=0)
        for (let i = 1; i < rows.length; i++) {
            const firstCell = rows[i].querySelector("td");
            if (firstCell) {
                const span = firstCell.querySelector("span");
                const anchor = firstCell.querySelector("a");

                if (span && anchor) {
                    const title = span.text.trim();
                    const link = anchor.getAttribute("href");

                    if (title && title.length > 0) {
                        try {
                            const noticeUrl = link
                                ? new URL(link, "https://mmmut.ac.in/").href
                                : null;
                            notices.push({
                                id: i,
                                title: title,
                                link: noticeUrl,
                                isNew: false,
                            });
                        } catch (urlError) {
                            notices.push({
                                id: i,
                                title: title,
                                link: link,
                                isNew: false,
                            });
                        }
                    }
                }
            }
        }

        const newNotices = [];
        for (const notice of notices) {
            const noticeNumber = extractNoticeNumber(notice.link);
            if (noticeNumber > lastNoticeNumber) {
                notice.isNew = true;
                newNotices.push(notice);
            } else {
                break;
            }
        }

        if (newNotices.length > 0) {
            const highestNumber = Math.max(
                ...newNotices.map((notice) => extractNoticeNumber(notice.link))
            );
            lastNoticeNumber = Math.max(lastNoticeNumber, highestNumber);

            const title = `New Notice: ${newNotices[0].title}`;
            let body = `<h2>New Notice Update</h2>`;
            body += `<h3>${newNotices[0].title}</h3>`;

            if (newNotices.length > 1) {
                body += `<hr><p><strong>+ ${newNotices.length - 1} more notice${
                    newNotices.length > 2 ? "s" : ""
                } available:</strong></p>`;
                const additionalNotices = newNotices.slice(1, 4);
                body += `<ul>`;
                additionalNotices.forEach((notice) => {
                    body += `<li>${notice.title}</li>`;
                });
                body += `</ul>`;
                if (newNotices.length > 4) {
                    body += `<p>...and ${newNotices.length - 4} more</p>`;
                }
            }
            body += `<hr><p><small><a href="https://notice-monitor.vercel.app">Visit the website</a> to view all notices.</small></p>`; // Get all subscribed emails and send notification
            const subscribedEmails = await subscriptionService.getAllEmails();
            if (subscribedEmails.length > 0) {
                const emailsStr = subscribedEmails.join(",");
                const APPS_SCRIPT_URL =
                    "https://script.google.com/macros/s/AKfycbyud1pPuMYIpM2RmXxhug2c2BK6eIXnc7hGf5A8VSNUOhi2Q6zo5VqStfcVGHdO0bo/exec";

                await axios.get(APPS_SCRIPT_URL, {
                    params: {
                        emails: emailsStr,
                        subject: title,
                        body: body,
                    },
                });
            }
        }

        return { notices, newNotices };
    } catch (error) {
        console.error("Error fetching notices:", error);
        return { notices: [], newNotices: [] };
    }
}

async function sendNotification(subject, body) {
    try {
        const subscribedEmails = await subscriptionService.getAllEmails();
        if (subscribedEmails.length > 0) {
            const emailsStr = subscribedEmails.join(",");
            const APPS_SCRIPT_URL =
                "https://script.google.com/macros/s/AKfycbyud1pPuMYIpM2RmXxhug2c2BK6eIXnc7hGf5A8VSNUOhi2Q6zo5VqStfcVGHdO0bo/exec";

            await axios.get(APPS_SCRIPT_URL, {
                params: {
                    emails: emailsStr,
                    subject: subject,
                    body: body,
                },
            });
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error sending notification:", error);
        return false;
    }
}

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Get notices endpoint
app.get("/api/notices", async (req, res) => {
    try {
        const { notices } = await fetchAndCheckNotices();
        res.json(notices);
    } catch (error) {
        console.error("Error in /api/notices:", error);
        res.status(500).json({ error: "Failed to fetch notices" });
    }
});

// Subscription endpoints
app.get("/api/subscribe", async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).send("No email provided");
        }

        const result = await subscriptionService.addEmail(email);
        res.send(result);
    } catch (error) {
        res.status(400).send(error.message);
    }
});

app.get("/api/subscribers", async (req, res) => {
    try {
        const emails = await subscriptionService.getAllEmails();
        res.json(emails);
    } catch (error) {
        res.status(500).send("Failed to fetch subscribers");
    }
});

// Notifier endpoint
app.get("/api/notify", async (req, res) => {
    try {
        const { subject, body } = req.query;

        if (!subject || !body) {
            return res.status(400).send("Missing subject or body");
        }

        const result = await sendNotification(subject, body);
        if (result) {
            res.send("Notification sent successfully");
        } else {
            res.status(404).send("No subscribers found or notification failed");
        }
    } catch (error) {
        res.status(500).send("Failed to send notification");
    }
});

const CHECK_INTERVAL = 60 * 60 * 1000;
console.log("Setting up periodic notice checking every 1 hour...");
setInterval(async () => {
    console.log("Running scheduled notice check...");
    await fetchAndCheckNotices();
}, CHECK_INTERVAL);

console.log("Running initial notice check...");
fetchAndCheckNotices();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
