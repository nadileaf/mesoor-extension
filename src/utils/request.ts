import * as qs from 'qs'

interface ExtraRequestErrorInfo {
    status: number
    data: string
}

class RequestError extends Error {
    public response: ExtraRequestErrorInfo

    constructor(message: string, extra: ExtraRequestErrorInfo) {
        super(message)
        this.response = extra
    }
}

interface Request {
    responseURL: string
}

interface RequestResponse {
    request: Request,
    headers: Headers,
    text(): Promise<string>
    json(): Promise<any>
    blob(): Promise<Blob>
}

// tslint:disable-next-line:max-line-length
export const request = async (url: string, opt?: RequestInit | undefined, params?: Object | undefined): Promise<RequestResponse> => {
    if (!!params) {
        const query = {}
        Object.keys(params).forEach((key: string) => query[key] = encodeURIComponent(params[key]))
        url = `${url}?${qs.stringify(params)}`
    }
    let response: Response
    if (!!opt) {
        response = await fetch(url, opt)
    } else {
        response = await fetch(url)
    }
    if (response.status !== 200) {
        const result = await response.text()
        throw new RequestError('request error1', {status: response.status, data: result})
    }
    return {
        text: async () => await response.text(),
        json: async () => await response.json(),
        blob: async () => await response.blob(),
        headers: response.headers,
        request: {
            responseURL: response.url
        }
    }
}