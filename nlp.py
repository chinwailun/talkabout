import streamlit as st 

#Summary Pakages
from gensim.summarization import summarize

# Sumy Summary Pkg
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lex_rank import LexRankSummarizer


#NLP
import spacy
nlp = spacy.load('en')
from spacy import displacy
HTML_WRAPPER = """<div style="overflow-x: auto; border: 1px solid #e6e9ef; border-radius: 0.25rem; padding: 1rem">{}</div>"""

# Web Scraping Pkg
#from bs4 import BeautifulSoup
#from urllib.request import urlopen


# Function for Sumy Summarization
def sumy_summarizer(docx):
	parser = PlaintextParser.from_string(docx,Tokenizer("english"))
	lex_summarizer = LexRankSummarizer()
	summary = lex_summarizer(parser.document,3)
	summary_list = [str(sentence) for sentence in summary]
	result = ' '.join(summary_list)
	return result

#NLP
#@st.cache(allow_output_mutation=True)
def analyze_text(text):
	return nlp(text)

def main():
        """Summary and Entity Checker"""

        st.title("Text Summarization")
        #activities = ["Text Summarizer","NER Checker"]
        #choice = st.sidebar.selectbox("Select Activity", activities)

        st.subheader("Summary with NLP")
        raw_text = st.text_area("Enter Text Here", "Type Here")
        #summary_choice = st.selectbox("Summary Choice",["Gensim","Sumy Lex Rank"])
        if st.button("Summarize"):
                summary_result = sumy_summarizer(raw_text)
				#summary_result = summarize (raw_text)
                st.write(summary_result)
        
        #if choice == 'Text Summarizer': 
               # st.subheader("Summary with NLP")
               # raw_text = st.text_area("Enter Text Here", "Type Here")
                #summary_choice = st.selectbox("Summary Choice",["Gensim","Sumy Lex Rank"])
               # if st.button("Summarize"):
                        #summary_result = sumy_summarizer(raw_text)
                       # st.write(summary_result)
                        
                        #if summary_choice == 'Gensim':
                         #       summary_result = summarize (raw_text)
                        #elif summary_choice == 'Sumy Lex Rank':"""
                                
                        
        
        #if choice == 'NER Checker':
              #  st.subheader("Named Entity Recognition")
              #  raw_text = st.text_area("Enter Text Here","Type Here")
               # if st.button("Analyze"):
                        #NLP
                      #  docx = analyze_text(raw_text)
                       # html = displacy.render(docx,style="ent")
                       # html = html.replace("\n\n","\n")
                       # st.write(HTML_WRAPPER.format(html),unsafe_allow_html=True)
                        


      
#streamlit run nlp.py

                
if __name__ == '__main__':
        main()
