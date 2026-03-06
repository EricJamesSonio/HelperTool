
---

## **General Steps to Create a GitHub Release**

1. **Decide which commit to release**

   * Could be the latest commit (for new version) or an older commit.

2. **Tag the commit**

```bash
git tag vX.Y.Z <commit-hash>
git push origin vX.Y.Z
```

* Replace `vX.Y.Z` with your version number.

3. **Build your app** (if applicable)

* Run your build command (`npx build` or similar).

4. **Prepare the build for release**

* Zip the build folder so all files are together.

5. **Create the release on GitHub**

* Go to **Releases → Create new release**
* Select the tag you created
* Add a **title** and **description**
* Upload your zipped build

6. **Publish the release**

* Users can now download that version
* Your repo can continue to have newer versions without losing old builds

---

**Tips:**

* Only track **source code** in the repo, not build artifacts
* Keep **builds in Releases** to save space and keep history clean
* You can release **older versions** anytime by tagging the correct commit

---


