import { expect, test, type Page } from "@playwright/test";

async function openApp(page: Page) {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("simon-settings-v1"))).not.toBeNull();
}

test("theme selection overrides either OS preference and survives reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  const shell = page.locator("body > div").first();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const darkBackground = await shell.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole("button", { name: "Theme: dark" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => shell.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(darkBackground);
  const lightBackground = await shell.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(page.locator("body")).toHaveCSS("color-scheme", "light");
  await page.reload();
  await expect(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
  await expect(shell).toHaveCSS("background-color", lightBackground);
});

test("memory and composer keep accessible names after typing", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.getByRole("button", { name: "+ Add memory item" }).click();
  await page.getByRole("textbox", { name: "Memory label", exact: true }).fill("Pet");
  await page.getByRole("textbox", { name: "Remembered detail", exact: true }).fill("Cockatoo");
  await page.getByRole("textbox", { name: "Message Simon", exact: true }).fill("Hello");
  await expect(page.getByLabel("Memory label", { exact: true })).toHaveValue("Pet");
  await expect(page.getByLabel("Remembered detail", { exact: true })).toHaveValue("Cockatoo");
  await expect(page.getByLabel("Message Simon", { exact: true })).toHaveValue("Hello");
  await page.reload();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(page.getByLabel("Memory label", { exact: true })).toHaveValue("Pet");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByLabel("Memory label", { exact: true })).toHaveCount(0);
});

test("offline history cannot be sent online; new online chats contain only their own history", async ({ page }) => {
  const requests: { mode: string; messages: { content: string }[] }[] = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { reply: "A reply" } });
  });
  await openApp(page);
  await page.getByLabel("Message Simon", { exact: true }).fill("PRIVATE OFFLINE TRANSCRIPT");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mode).toBe("offline");
  await page.getByLabel("Mode", { exact: true }).selectOption("online");
  await page.getByLabel("Message Simon", { exact: true }).fill("Do not send this across modes");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(page.getByText(/This offline conversation can’t be sent in online mode/)).toBeVisible();
  await page.getByRole("button", { name: "+ New chat", exact: true }).click();
  await page.getByLabel("Message Simon", { exact: true }).fill("ONLINE ONLY");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].mode).toBe("online");
  expect(JSON.stringify(requests[1])).not.toContain("PRIVATE OFFLINE TRANSCRIPT");
  await page.getByRole("button", { name: /PRIVATE OFFLINE TRANSCRIPT/ }).click();
  await page.getByLabel("Message Simon", { exact: true }).fill("Still offline");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByLabel("Mode", { exact: true }).selectOption("offline");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].mode).toBe("offline");
  expect(JSON.stringify(requests[2])).not.toContain("ONLINE ONLY");
});

test("reload hydrates saved data; streaming persists once and preserves titles and Markdown", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { archiveWrites: 0 });
    Storage.prototype.setItem = function (key, value) {
      if (key === "simon-conversations-v1") {
        const tracker = window as typeof window & { archiveWrites: number };
        tracker.archiveWrites++;
      }
      original.call(this, key, value);
    };
  });
  const reply = "  # Heading\n\n- parent\n  - child\n\n```python\n    print('hello')\n```\n\nline  \nnext  ";
  await page.route("**/api/chat", (route) => route.fulfill({ json: { reply } }));
  await openApp(page);
  await page.getByLabel("Conversation title").fill("My custom title");
  await page.getByLabel("Message Simon", { exact: true }).fill("Hello **Simon**");
  await page.evaluate(() => Object.assign(window, { archiveWrites: 0 }));
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("simon-conversations-v1")!)[0].messages.at(-1).content)).toBe(reply);
  expect(await page.evaluate(() => (window as typeof window & { archiveWrites: number }).archiveWrites)).toBe(1);
  await expect(page.getByLabel("Conversation title")).toHaveValue("My custom title");
  await expect(page.getByRole("heading", { name: "Heading" })).toHaveCSS("font-weight", "800");
  await expect(page.locator("article ul").first()).toHaveCSS("list-style-type", "disc");
  await expect(page.locator("article pre")).toHaveCSS("white-space", "pre");
  await expect(page.locator("article pre code")).toHaveText("    print('hello')\n");
  await page.reload();
  await expect(page.getByLabel("Conversation title")).toHaveValue("My custom title");
  await expect(page.getByRole("heading", { name: "Heading" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile users can create and reopen conversations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByLabel("Conversation title").fill("Original mobile chat");
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await page.getByRole("button", { name: "+ New chat", exact: true }).click();
  await expect(page.getByLabel("Conversation title")).toHaveValue("New conversation");
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await page.getByRole("button", { name: /Original mobile chat/ }).click();
  await expect(page.getByLabel("Conversation title")).toHaveValue("Original mobile chat");
});
