const FORM_URLENCODED = "application/x-www-form-urlencoded";
const { parse } = require("querystring");

JSON.safeStringify = (obj, indent = 4) => {
    let cache = [];
    let retVal = JSON.stringify(
        obj,
        (key, value) =>
            typeof value === "object" && value !== null
                ? cache.includes(value)
                    ? undefined // Duplicate reference found, discard key
                    : cache.push(value) && value // Store value in our collection
                : value,
        indent
    );
    cache = null;
    return retVal;
};

function collectAwsData({ isBase64, body }) {
    try {
        if (isBase64) {
            body = Buffer.from(body, "base64").toString("utf8");
        }
        body = JSON.parse(body);
    } catch (error) {
        console.log(error);
        body = {};
    } finally {
        return body;
    }
}

function collectRequestData(request) {
    return new Promise((resolve, reject) => {
        let data = "";

        request.on("data", function (chunk) {
            data += chunk.toString();
        });

        request.on("error", (error) => {
            reject(error);
        });

        if (request.headers["content-type"] === FORM_URLENCODED) {
            request.on("end", () => {
                resolve(parse(data));
            });
        } else if (
            request.headers["content-type"] &&
            request.headers["content-type"].toLowerCase().includes("json")
        ) {
            request.on("end", function () {
                resolve(JSON.parse(data));
            });
        } else {
            resolve({});
        }
    });
}

class WebResponseAdapter {
    constructor(response = false) {
        this.body = {};
        this.statusCode = 200;
        this.response = response;
        // Check if AWS:
        this.isAWSRequest = !response;
        // Check if Normal Node:
        if (response) {
            this.isPlainRequest = true;
        }
    }

    status(statusCode) {
        this.statusCode = statusCode;
        return this;
    }

    json(body) {
        this.body = body;
        return this;
    }

    end() {
        if (this.isPlainRequest) {
            this.response.writeHead(this.statusCode, {
                "Content-Type": "application/json",
            });
            return this.response.end(JSON.safeStringify(this.body));
        }
        //
        return {
            statusCode: this.statusCode,
            body: JSON.safeStringify(this.body),
        };
    }
}

class WebRequestAdapter {
    constructor(request) {
        this.request = request;
        // Check if AWS:
        this.isAWSRequest =
            request.resource && request.path && request.httpMethod;
        // Check if Normal Node:
        this.isPlainRequest =
            request.url && request.method && request._readableState;
        this.method = this.isAWSRequest ? request.httpMethod : request.method;
    }

    async getBody() {
        //
        if (this.isAWSRequest) {
            this.body = collectAwsData(this.request);
        } else {
            this.body = await collectRequestData(this.request);
        }
        return this.body;
    }
}

module.exports = {
    WebResponseAdapter,
    WebRequestAdapter,
};
