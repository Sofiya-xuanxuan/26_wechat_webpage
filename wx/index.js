const Koa = require('koa')
const Router = require('koa-router')
const static = require('koa-static')
const bodyparser = require('koa-bodyparser')
const axios = require('axios')
const app = new Koa()
app.use(bodyparser())
const router = new Router()
app.use(static(__dirname + '/'))

const conf = require('./conf')
const wechat = require('co-wechat')
router.all('/wechat', wechat(conf).middleware(
    async message => {
        console.log('wechat', message)
        return 'hello wechat' + message.Content
    }
))
//获取Access_token
const tokencache = {
    access_token: '',
    updateTime: Date.now(),
    expires_in: 7200
}

router.get('/getTokens', async ctx => {
    const wxDomain = `https://api.weixin.qq.com`
    const paths = `/cgi-bin/token`
    const param = `?grant_type=client_credential&appid=${conf.appid}&secret=${conf.appsecret}`

    const url = wxDomain + paths + param
    const res = await axios.get(url)
    Object.assign(tokencache, res.data, {
        updateTime: Date.now()
    })
    ctx.body = res.data
})

// router.get('/getFollowers',async ctx=>{
//     console.log(9999);

//     console.log(tokencache.access_token);

//     const url=`https://api.weixin.qq.com/cgi-bin/user/get?access_token=${tokencache.access_token}`
//     console.log(url);

//     const res=await axios.get(url)
//     console.log('getFollowers',res);
//     ctx.body=res.data
// })


const { ServerToken, ClientToken } = require('./mongoose')
//实际工作中通过库来实现,不需要手动去获取Access_token了
const wechatAPI = require('co-wechat-api')
const api = new wechatAPI(
    conf.appid,
    conf.appsecret,
    //取token
    async () => await ServerToken.findOne(),
    //存token
    async token => await ServerToken.updateOne({}, token, { upsert: true })
)

//获取关注者列表
router.get('/getFollowers', async ctx => {
    let res = await api.getFollowers()
    res = await api.batchGetUsers(res.data.openid, 'zh_CN')
    ctx.body = res
})

const OAuth = require('co-wechat-oauth')
const oauth = new OAuth(
    conf.appid,
    conf.appsecret,
    // 取token
    async function(openid) {return await ClientToken.getToken(openid)},
    // 存token
    async function(openid, token) {return await ClientToken.setToken(openid, token)} 
)
//用户认证请求
router.get('/wxAuthorize', async (ctx, next) => {
    const state = ctx.query.id
    console.log('ctx....' + ctx.href);
    //重定向到微信认证页面

    //目标地址
    redirectUrl = ctx.href
    redirectUrl = redirectUrl.replace('wxAuthorize', 'wxCallback')
    const scope = 'snsapi_userinfo'

    console.log('redirectUrl.....', redirectUrl);

    const url = oauth.getAuthorizeURL(redirectUrl, state, scope)
    console.log('url....', url);

    ctx.redirect(url)

})



//获取用户回调AccessToken与openid
router.get('/wxCallback', async (ctx, next) => {
    console.log(99999);

    //授权码
    const code = ctx.query.code
    console.log('callback...', code);
    const token = await oauth.getAccessToken(code)
    const accessToken = token.data.access_token
    const openid = token.data.openid
    console.log('accessToken', accessToken);
    console.log('openid', openid);

    //刷新页面
    ctx.redirect('/?openid=' + openid)
})

//获取用户信息
router.get('/getUser', async (ctx, next) => {
    const openid = ctx.query.openid
    const userinfo = await oauth.getUser(openid)
    ctx.body = userinfo
})



router.get('/getJsConfig',async ctx=>{
    const res=await api.getJsConfig(ctx.query)
    ctx.body=res
})


// 启动路由
app.use(router.routes())
app.use(router.allowedMethods)
app.listen(3000)