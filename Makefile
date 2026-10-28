.PHONY: store clean test

# Thin wrapper around the pnpm scripts in package.json.
store:
	@pnpm package

test:
	@pnpm test

clean:
	@rm -rf web-ext-artifacts faster_pageload.zip
