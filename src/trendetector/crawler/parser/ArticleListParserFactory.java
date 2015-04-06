package trendetector.crawler.parser;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.regex.Pattern;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Whitelist;
import org.jsoup.select.Elements;

import trendetector.crawler.Article;
import trendetector.crawler.URLStringUtil;

public class ArticleListParserFactory {

	public static ArticleListParser create(String community, String url) {
		switch (community) {
		case "CL":
			return new ClienParser(url);
		case "SR":
			return new SLRClubParser(url);
		}
		
		return null;
	}
	
}


class ClienParser extends ArticleListParser {
	private Whitelist whitelist;	// �ۼ��ڰ� text�� ���� img�� ��� ó��
	private SimpleDateFormat strToDateFormat;	// �ۼ��� parsing
	
	public ClienParser(String url) {
		super(url);
		this.whitelist = new Whitelist();
		this.whitelist.addAttributes("img", "src");
		this.whitelist.addProtocols("img", "src", "http", "https");
		this.strToDateFormat  = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
	}

	public List<Article> parse(ArticleParseError parseError) throws IOException {
		List<Article> articleList = new ArrayList<Article>();
		Document doc = Jsoup.connect(this.getUrl()).get();
		Elements items = doc.select(".board_main .mytr");
		
		/* set Next Page URL */
		this.setNextPageUrl(doc.select(".paging .cur_page + a").attr("abs:href"));
		
		for (Element item : items) {
			Article article = new Article();
			
			try {
				Elements td = item.select("td");
				
				/* �����ڰ� ������ �Խñ� ����ó�� */
				if (td.get(3).select("span").attr("title").isEmpty()) {
					continue;
				}
				
				article.setArticleNo(Integer.parseInt(td.get(0).text()));
				article.setSubject(td.get(1).select("a").text());
				
				/* �ۼ��ڰ� img�� ��� src�� �����η� ���� */
				article.setAuthor(Jsoup.clean(td.get(2).html(), this.getUrl(), whitelist));
				
				/* replies�� �ִ� ��� [%d] ���¸� ���Խ����� �ȿ� ���ڰ��� ���� */
				String strReplies = td.get(1).select("span").text();
				if (!strReplies.isEmpty()) {
					article.setReplies(Integer.parseInt(strReplies.replaceAll("[\\[\\]]", "")));
				}
				
				article.setHit(Integer.parseInt(td.get(4).text()));
				article.setDate(strToDateFormat.parse(td.get(3).select("span").attr("title")));
				article.setUrl(td.get(1).select("a").attr("abs:href"));
				
				articleList.add(article);
				
			} catch (Exception e) {
				parseError.callback(e, article);
			}
		}
		
		return articleList;
	}
	
}


class SLRClubParser extends ArticleListParser {
	private Date lastDate;	// ������ �Ľ��� ���� �ð�
	private SimpleDateFormat strToDateFormat;	// String -> Date ���� ����
	private SimpleDateFormat dateToStrFormat;	// Date -> String ���� ����
	
	public SLRClubParser(String url) {
		super(url);
		this.lastDate = null;
		this.strToDateFormat = new SimpleDateFormat("yyyy/MM/dd HH:mm:ss");
		this.dateToStrFormat = new SimpleDateFormat("yyyy/MM/dd");
	}

	@Override
	public List<Article> parse(ArticleParseError parseError) throws IOException {
		List<Article> articleList = new ArrayList<Article>();
		Document doc = Jsoup.connect(this.getUrl()).get();
		Elements items = doc.select("#bbs_list tbody tr");
		
		/* set Next Page URL */
		try {
			int page = Integer.parseInt(doc.select(".list_num #actpg").text());
			page++;
			this.setNextPageUrl(URLStringUtil.urlAddQuery(this.getUrl(), "page", page + ""));
		} catch (Exception e) {
			this.setNextPageUrl(null);
		}
		
		for (Element item : items) {
			Article article = new Article();
			
			try {
				/* ���������� ��� �Խñ� ��ȣ�� �����Ƿ� ����ó�� */
				if (item.select(".list_num").text().isEmpty()) {
					continue;
				}
				
				/* �亯�Խñ��� ��� �Ǿտ� img�� �ִ��� ���η� �Ǵ��Ͽ� ����ó�� */
				if (!item.select(".sbj img").isEmpty()) {
					continue;
				}
				
				/* SLRŬ���� 24�ð� �����۱����� �ۼ����� HH:mm:ss �� ǥ���ϴµ�,
				 * �ٸ� ������ ��� ����ó�� */
				String strDate = item.select(".list_date").text();
				if (!Pattern.matches("[0-2][0-9]:[0-5][0-9]:[0-5][0-9]", strDate)) {
					continue;
				}
				
				article.setArticleNo(Integer.parseInt(item.select(".list_num").text()));
				article.setSubject(item.select(".sbj a").text());
				article.setAuthor(item.select(".list_name").text());
				
				/* ��� �� ���� �� ���ŵǴ� �±��̹Ƿ� �ݵ�� ���� �ؾ� �� */
				article.setUrl(item.select(".sbj a").attr("abs:href"));
				
				/* ��� ���� �����ϱ� ���� ���񿡼� a �±׷� ������ �κ��� �����ϰ� �Ľ� */
				item.select(".sbj a").remove();
				String strReplies = item.select(".sbj").text();
				if (!strReplies.isEmpty()) {
					article.setReplies(Integer.parseInt(strReplies.replaceAll("[\\[\\]]", "")));
				}
				
				article.setHit(Integer.parseInt(item.select(".list_click").text()));
				
				/* ��Ͽ��� ��¥�� Ȯ���� �� �ִ� ����� �����Ƿ� ������ �Ľ��� ���� �ð���
				 * ����� �ΰ� ū ���̷� ������ ��� �Ϸ� �� ���� �� �������� �Ǵ��� */
				Date date = null;
				if (lastDate == null) {
					Date now = new Date();
					date = strToDateFormat.parse(dateToStrFormat.format(now) + " " + strDate);
					
					if (date.getTime() - now.getTime() > 12 * 60 * 60 * 1000) {
						date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
					} 
					else if (now.getTime() - date.getTime() > 12 * 60 * 60 * 1000) {
						date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
					}
				}
				else {
					date = strToDateFormat.parse(dateToStrFormat.format(lastDate) + " " + strDate);
					
					if (date.getTime() - lastDate.getTime() > 12 * 60 * 60 * 1000) {
						date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
					}
				}
				lastDate = date;
				article.setDate(date);
				
				articleList.add(article);
				
			} catch (Exception e) {
				parseError.callback(e, article);
			}
		}
		
		return articleList;
	}
	
}

