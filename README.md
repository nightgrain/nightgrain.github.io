# Hello World

Open [index.html](index.html) in your browser (double-click the file).

Or serve the folder with Python and open http://localhost:8000:

```bash
python -m http.server 8000
```

Flickr notes
- **API key**: this example uses the provided API key in the client to call `flickr.test.echo`.
- **Do not embed the secret**: never put your Flickr secret in client-side JavaScript. If you need to call authenticated methods, create a small server-side proxy that signs requests with the secret and forwards them to Flickr.

Example fetch used in `script.js`:

```js
const params = new URLSearchParams({
	method: 'flickr.test.echo',
	api_key: '<your-api-key-here>',
	format: 'json',
	nojsoncallback: '1'
});
fetch('https://api.flickr.com/services/rest/?' + params.toString())
	.then(r => r.json())
	.then(console.log);
```

Favorites example

The page now includes a `User NSID` input and a `Get Favorites` button. Enter a NSID (for example `7357400@N08`) and click the button to fetch that user's public favorites. The page will show thumbnails and links to each photo's Flickr page.

Reminder: authenticated calls that require your **secret** must be proxied through a server. Do not place the secret in `script.js`.
