/* this functon will be invoked before publish */
export async function prepublish(version: string, message: string) {
    console.log('on prepublish', version, message)
}

/* this functon will be invoked after publish */
export async function postpublish() {
    console.log('on postpublish')
}
