# 🤖 Best Practices for AI-Friendly dApps (Web3 x AI Integration)

Welcome! If you are building on the **Hoglet Platform** or developing a dApp on the Supra Blockchain, adopting these best practices will make your platform instantly compatible with modern AI Agents (like Cursor, ChatGPT, and autonomous trading bots).

The future of Web3 is agentic. By following these guidelines, you allow AI agents to understand, interact with, and build upon your smart contracts with zero human friction.

---

## 1. Adopt the `/llm.txt` Standard (Agentic SEO)

Just like `robots.txt` tells Google how to crawl your site, `llm.txt` tells AI models how to interact with your protocol.

**What to do:**
Create a static route in your app (e.g., `https://your-dapp.com/llm.txt`) that serves a plain-text Markdown file.

**What it should contain:**
- A brief explanation of what your dApp does.
- The base URLs for your APIs or smart contract addresses.
- Clear instructions on how an AI should formulate a transaction or query for your specific protocol.
- Examples of the data structures you expect.

*Why it matters:* When a developer asks an AI to "Build a bot for [Your dApp]", the AI will automatically fetch `your-dapp.com/llm.txt` and instantly know how to write the code without hallucinating.

---

## 2. Expose an "Export for AI" Feature (Rich JSON ABI)

Standard ABIs are built for compilers and indexers, not for LLMs. If you have a UI where users interact with contracts, provide a way to export the function context as a highly readable JSON.

**Best Practice Schema:**
Instead of raw Move/Solidity ABIs, provide a "Rich JSON" that explicitly defines:
- `fully_qualified_name` (e.g., `0x123::module::function`)
- `execution_kind` (e.g., `entry`, `view`)
- `requires_wallet_signature` (boolean)
- `arguments` (with human-readable hints and example formats like `0x1::supra_coin::SupraCoin`)

*Why it matters:* An AI can read this JSON and immediately construct the exact TypeScript/Python SDK call needed to interact with the contract, saving the developer hours of debugging type mismatches.

---

## 3. Implement "Dry Run" / Raw Payload Visibility

AI-generated code needs verification. Always provide a way for developers (and their AIs) to see the **Raw Payload** before a transaction is sent to the wallet.

**What to do:**
- Create a "View Raw Payload" toggle in your UI.
- Display the exact array or JSON object that will be passed to the wallet provider (e.g., Starkey).

*Why it matters:* Transparency. If an AI generates a payload, the developer can compare it against your UI's Raw Payload to ensure the AI didn't hallucinate a sequence number, a type argument, or a module address. 

---

## 4. Semantic HTML for AI Web Scrapers

Many AI agents browse the web autonomously. If your dApp is built with `<div>` soup, the AI cannot "click" your buttons or read your state.

**What to do:**
- Use standard semantic tags: `<button>`, `<form>`, `<input>`, `<nav>`.
- Add `aria-labels` to critical action buttons (e.g., `aria-label="Execute Swap"`).
- Ensure error messages are rendered as plain text in the DOM, not just hidden in canvas or complex tooltips.

---

## 5. Leverage the Hoglet Interactor

If you want to skip building all of this yourself, **use the Hoglet Smart Contract Interactor**. 
The Hoglet platform comes with these AI-first features built-in out of the box. By routing your developers through Hoglet, they instantly get access to `/llm.txt` generation, AI Export buttons, and fully qualified payload parsing.

***

*Drafted by the Hoglet AI Engineering Team.*
