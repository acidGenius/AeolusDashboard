const { ClobClient } = require("@polymarket/clob-client");
const { Wallet } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is missing from .env");
  }
  const wallet = new Wallet(privateKey);
  const client = new ClobClient("https://clob.polymarket.com", 137, wallet);
  const creds = await client.createOrDeriveApiKey();
  console.log(JSON.stringify(creds, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
