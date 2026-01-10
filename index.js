const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

let logsBatch = [];
let isFlushing = false;

//  Run cron every 10 seconds
cron.schedule("*/1 * * * * *", async () => {
	if (!isFlushing) {
		flushLogs().catch((err) => {
			console.error("Flush failed:", err.message);
		});
	}
});

async function flushLogs() {
	if (logsBatch.length === 0 || isFlushing) return;

	isFlushing = true;

	const logsToFlush = [...logsBatch];
	logsBatch = [];

	try {
		await axios.post(
			`${process.env.ADVOID_BACKEND_URL}/admin/ingest-logs`,
			{ logs: logsToFlush },
			{
				headers: {
					Authorization: `Bearer ${process.env.ADVOID_API_KEY}`,
				},
				timeout: 5000,
			}
		);

		console.log(`Flushed ${logsToFlush.length} logs`);
	} catch (error) {
		console.error("Error flushing logs:", error.message);

		// Requeue logs on failure
		logsBatch.unshift(...logsToFlush);
	} finally {
		isFlushing = false;
	}
}

app.post("/ingest", (req, res) => {
	logsBatch.push(req.body);

	if (logsBatch.length > 10_000) {
		logsBatch.splice(0, logsBatch.length - 10_000);
	}

	res.status(200).send("Log received");
});

app.get("/", (req, res) => {
	res.send("Log sidecar healthy");
});

app.listen(9000, () => {
	console.log("Log sidecar running on port 9000");
});
